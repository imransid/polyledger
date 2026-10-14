import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { fromDateString } from '../../common/dates.js';
import { isUniqueViolation } from '../../database/errors.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { GetFormulaVersionQuery } from '../../formulas/queries/get-formula-version.js';
import type { JobCard, Prisma, Shift } from '../../generated/prisma/client.js';
import { GetRawMaterialsQuery } from '../../materials/queries/get-raw-materials.js';
import {
  PostStockDocumentCommand,
  type StockDocumentLine,
} from '../../stock/commands/post-stock-document.js';
import { GetLocationQuery } from '../../stock/queries/get-location.js';
import { floorWasteUse, type WasteLine } from '../domain/waste.js';
import { assertInWork, lockJobCard } from '../infra/job-cards.js';
import {
  toWasteEntryView,
  type WasteEntryView,
} from '../infra/waste-entries.js';

export interface NewWasteEntry {
  /** The date the shift started: night shift C keeps its start date. */
  shiftDate: string;
  shift: Shift;
  wasteMaterialId: string;
  scrapLocationId: string;
  lines: WasteLine[];
}

export class RecordWasteCommand extends Command<WasteEntryView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly entry: NewWasteEntry,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// All the shift's weighed waste goes into one regrind material at a scrap
// yard; purge and sweepings also come off the floor by the frozen formula.
@CommandHandler(RecordWasteCommand)
export class RecordWasteHandler implements ICommandHandler<RecordWasteCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    actorId,
    jobCardId,
    entry,
    idempotencyKey,
  }: RecordWasteCommand): Promise<WasteEntryView> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'RecordWaste' },
          () => this.record(tx, actorId, jobCardId, entry),
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `There is already waste for shift ${entry.shift} on ${entry.shiftDate}`,
        );
      }
      throw error;
    }
  }

  private async record(
    tx: Prisma.TransactionClient,
    actorId: string,
    jobCardId: string,
    entry: NewWasteEntry,
  ): Promise<WasteEntryView> {
    const card = await lockJobCard(tx, jobCardId);
    assertInWork(card);
    const shiftDate = fromDateString(entry.shiftDate);
    const existing = await tx.wasteEntry.findFirst({
      where: { jobCardId, shiftDate, shift: entry.shift, reversedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        `${card.number} already has waste for shift ${entry.shift} on ${entry.shiftDate}`,
      );
    }
    await this.assertWasteGoesToScrap(entry);

    const document = await this.commandBus.execute(
      new PostStockDocumentCommand(
        tx,
        { kind: 'WASTE', postedById: actorId, jobCardId },
        await this.stockLines(card, entry),
      ),
    );
    const created = await tx.wasteEntry.create({
      data: {
        jobCardId,
        shiftDate,
        shift: entry.shift,
        wasteMaterialId: entry.wasteMaterialId,
        scrapLocationId: entry.scrapLocationId,
        stockDocumentId: document.id,
        recordedById: actorId,
        lines: { create: entry.lines },
      },
      include: { lines: true },
    });
    await recordEvent(tx, 'production.waste_recorded', {
      entryId: created.id,
      jobCardId,
      jobCardNumber: card.number,
      documentNumber: document.number,
      shiftDate: entry.shiftDate,
      shift: entry.shift,
      lines: entry.lines,
    });
    return toWasteEntryView(created);
  }

  private async assertWasteGoesToScrap({
    wasteMaterialId,
    scrapLocationId,
  }: NewWasteEntry) {
    const [material] = await this.queryBus.execute(
      new GetRawMaterialsQuery([wasteMaterialId]),
    );
    if (!material?.isActive || material.type !== 'REGRIND') {
      throw new BadRequestException(
        'The waste material must be an active REGRIND raw material',
      );
    }
    const location = await this.queryBus.execute(
      new GetLocationQuery(scrapLocationId),
    );
    if (!location?.isActive || location.kind !== 'SCRAP_YARD') {
      throw new BadRequestException('Waste must go to an active scrap yard');
    }
  }

  private async stockLines(
    card: JobCard,
    entry: NewWasteEntry,
  ): Promise<StockDocumentLine[]> {
    const formula = await this.queryBus.execute(
      new GetFormulaVersionQuery(card.formulaVersionId),
    );
    const offTheFloor = floorWasteUse(formula!.lines, entry.lines)
      .filter((use) => use.grams > 0)
      .map((use) => ({
        itemType: 'RAW_MATERIAL' as const,
        itemId: use.rawMaterialId,
        locationId: card.floorLocationId,
        change: { by: -use.grams },
      }));
    const weighed = entry.lines.reduce((sum, line) => sum + line.grams, 0);
    return [
      ...offTheFloor,
      {
        itemType: 'RAW_MATERIAL',
        itemId: entry.wasteMaterialId,
        locationId: entry.scrapLocationId,
        change: { by: weighed },
      },
    ];
  }
}
