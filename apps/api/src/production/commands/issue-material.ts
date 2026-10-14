import { BadRequestException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { GetFormulaVersionQuery } from '../../formulas/queries/get-formula-version.js';
import { PostStockDocumentCommand } from '../../stock/commands/post-stock-document.js';
import { GetLocationQuery } from '../../stock/queries/get-location.js';
import type { StockDocumentView } from '../../stock/queries/get-stock-document.js';
import { assertInWork, lockJobCard } from '../infra/job-cards.js';

export interface MaterialLine {
  rawMaterialId: string;
  grams: number;
}

export class IssueMaterialCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly fromLocationId: string,
    readonly lines: MaterialLine[],
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// From a raw material store to the job card's floor. Only the frozen
// formula's materials: anything else would never be backflushed.
@CommandHandler(IssueMaterialCommand)
export class IssueMaterialHandler implements ICommandHandler<IssueMaterialCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    jobCardId,
    fromLocationId,
    lines,
    idempotencyKey,
  }: IssueMaterialCommand): Promise<StockDocumentView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'IssueMaterial' },
        async () => {
          const card = await lockJobCard(tx, jobCardId);
          assertInWork(card);
          const [store, formula] = await Promise.all([
            this.queryBus.execute(new GetLocationQuery(fromLocationId)),
            this.queryBus.execute(
              new GetFormulaVersionQuery(card.formulaVersionId),
            ),
          ]);
          if (!store?.isActive || store.kind !== 'RAW_MATERIAL_STORE') {
            throw new BadRequestException(
              'Issue from an active raw material store',
            );
          }
          const inFormula = new Set(
            formula!.lines.map((line) => line.rawMaterialId),
          );
          if (!lines.every((line) => inFormula.has(line.rawMaterialId))) {
            throw new BadRequestException(
              "Only materials in the job card's formula can be issued",
            );
          }

          return this.commandBus.execute(
            new PostStockDocumentCommand(
              tx,
              { kind: 'ISSUE', postedById: actorId, jobCardId },
              lines.flatMap(({ rawMaterialId, grams }) => [
                {
                  itemType: 'RAW_MATERIAL' as const,
                  itemId: rawMaterialId,
                  locationId: fromLocationId,
                  change: { by: -grams },
                },
                {
                  itemType: 'RAW_MATERIAL' as const,
                  itemId: rawMaterialId,
                  locationId: card.floorLocationId,
                  change: { by: grams },
                },
              ]),
            ),
          );
        },
      ),
    );
  }
}
