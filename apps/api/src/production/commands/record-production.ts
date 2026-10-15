import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import type { AuthUser } from '../../auth/decorators.js';
import { GetUserQuery } from '../../auth/queries/get-user.js';
import { fromDateString } from '../../common/dates.js';
import { isUniqueViolation } from '../../database/errors.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { GetFormulaVersionQuery } from '../../formulas/queries/get-formula-version.js';
import type { JobCard, Prisma, Shift } from '../../generated/prisma/client.js';
import { PostStockDocumentCommand } from '../../stock/commands/post-stock-document.js';
import { backflush } from '../domain/backflush.js';
import { entryWarnings } from '../domain/entry-warnings.js';
import {
  assertInWork,
  type EntryView,
  lockJobCard,
  toEntryView,
} from '../infra/job-cards.js';

export interface NewProductionEntry {
  /** The date the shift started: night shift C keeps its start date. */
  shiftDate: string;
  shift: Shift;
  operatorId: string;
  shotStart: number;
  shotEnd: number;
  goodPieces: number;
  rejectedPieces: number;
}

export type RecordedEntry = EntryView & { warnings: string[] };

export class RecordProductionCommand extends Command<RecordedEntry> {
  constructor(
    readonly actor: AuthUser,
    readonly jobCardId: string,
    readonly entry: NewProductionEntry,
    readonly idempotencyKey: string | undefined,
    /** A tablet names its own records. */
    readonly entryId?: string,
  ) {
    super();
  }
}

// Backflush: consumes the floor's raw material for every piece made and
// every runner shot, and puts the good pieces on the floor.
@CommandHandler(RecordProductionCommand)
export class RecordProductionHandler implements ICommandHandler<RecordProductionCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    actor,
    jobCardId,
    entry,
    idempotencyKey,
    entryId,
  }: RecordProductionCommand): Promise<RecordedEntry> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          {
            actorId: actor.id,
            key: idempotencyKey,
            command: 'RecordProduction',
          },
          () => this.record(tx, actor, jobCardId, entry, entryId),
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `There is already an entry for shift ${entry.shift} on ${entry.shiftDate}`,
        );
      }
      throw error;
    }
  }

  private async record(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    jobCardId: string,
    entry: NewProductionEntry,
    entryId: string | undefined,
  ): Promise<RecordedEntry> {
    // A tablet that never heard back sends the same record again.
    const earlier =
      entryId &&
      (await tx.productionEntry.findUnique({
        where: { id: entryId },
        include: { materials: true },
      }));
    if (earlier) {
      return { ...toEntryView(earlier), warnings: [] };
    }
    const card = await lockJobCard(tx, jobCardId);
    assertInWork(card);
    await this.assertOperator(actor, entry.operatorId);
    const shiftDate = fromDateString(entry.shiftDate);
    const existing = await tx.productionEntry.findFirst({
      where: { jobCardId, shiftDate, shift: entry.shift, reversedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        `${card.number} already has an entry for shift ${entry.shift} on ${entry.shiftDate}`,
      );
    }

    const formula = await this.queryBus.execute(
      new GetFormulaVersionQuery(card.formulaVersionId),
    );
    const uses = backflush(
      { ...card, lines: formula!.lines },
      {
        pieces: entry.goodPieces + entry.rejectedPieces,
        shots: entry.shotEnd - entry.shotStart,
      },
    );
    const document = await this.commandBus.execute(
      new PostStockDocumentCommand(
        tx,
        { kind: 'PRODUCTION', postedById: actor.id, jobCardId },
        [
          ...uses.map((use) => ({
            itemType: 'RAW_MATERIAL' as const,
            itemId: use.rawMaterialId,
            locationId: card.floorLocationId,
            change: { by: -(use.pieceGrams + use.runnerGrams) },
          })),
          {
            itemType: 'PRODUCT' as const,
            itemId: card.productId,
            locationId: card.floorLocationId,
            change: { by: entry.goodPieces },
          },
        ],
      ),
    );

    const previousShotEnd = await this.previousShotEnd(tx, card, entry);
    const created = await tx.productionEntry.create({
      data: {
        ...entry,
        id: entryId,
        shiftDate,
        jobCardId,
        stockDocumentId: document.id,
        recordedById: actor.id,
        materials: { create: uses },
      },
      include: { materials: true },
    });
    await recordEvent(tx, 'production.entry_recorded', {
      entryId: created.id,
      jobCardId,
      jobCardNumber: card.number,
      documentNumber: document.number,
      shiftDate: entry.shiftDate,
      shift: entry.shift,
      goodPieces: entry.goodPieces,
      rejectedPieces: entry.rejectedPieces,
    });

    return {
      ...toEntryView(created),
      warnings: entryWarnings(entry, card.cavities, previousShotEnd),
    };
  }

  private async assertOperator(actor: AuthUser, operatorId: string) {
    if (actor.role === 'OPERATOR' && operatorId !== actor.id) {
      throw new ForbiddenException('Operators record their own production');
    }
    const operator = await this.queryBus.execute(new GetUserQuery(operatorId));
    if (!operator?.isActive || operator.role !== 'OPERATOR') {
      throw new BadRequestException(
        'The operator must be an active user with the OPERATOR role',
      );
    }
  }

  // The latest earlier shift on the same machine, whichever card it was for.
  private async previousShotEnd(
    tx: Prisma.TransactionClient,
    card: JobCard,
    entry: NewProductionEntry,
  ): Promise<number | null> {
    const [previous] = await tx.$queryRaw<{ shotEnd: number }[]>`
      SELECT e.shot_end AS "shotEnd"
      FROM production_entries e
      JOIN job_cards j ON j.id = e.job_card_id
      WHERE j.machine_id = ${card.machineId}::uuid
        AND e.reversed_at IS NULL
        AND (e.shift_date, e.shift) < (${entry.shiftDate}::date, ${entry.shift}::"Shift")
      ORDER BY e.shift_date DESC, e.shift DESC
      LIMIT 1`;
    return previous?.shotEnd ?? null;
  }
}
