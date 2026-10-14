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
import { PostStockDocumentCommand } from '../../stock/commands/post-stock-document.js';
import { GetLocationQuery } from '../../stock/queries/get-location.js';
import type { StockDocumentView } from '../../stock/queries/get-stock-document.js';
import { assertInWork, lockJobCard } from '../infra/job-cards.js';
import type { MaterialLine } from './issue-material.js';

export class ReturnMaterialCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly toLocationId: string,
    readonly lines: MaterialLine[],
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ReturnMaterialCommand)
export class ReturnMaterialHandler implements ICommandHandler<ReturnMaterialCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    jobCardId,
    toLocationId,
    lines,
    idempotencyKey,
  }: ReturnMaterialCommand): Promise<StockDocumentView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReturnMaterial' },
        async () => {
          const card = await lockJobCard(tx, jobCardId);
          assertInWork(card);
          const store = await this.queryBus.execute(
            new GetLocationQuery(toLocationId),
          );
          if (!store?.isActive || store.kind !== 'RAW_MATERIAL_STORE') {
            throw new BadRequestException(
              'Return to an active raw material store',
            );
          }

          return this.commandBus.execute(
            new PostStockDocumentCommand(
              tx,
              { kind: 'RETURN', postedById: actorId, jobCardId },
              lines.flatMap(({ rawMaterialId, grams }) => [
                {
                  itemType: 'RAW_MATERIAL' as const,
                  itemId: rawMaterialId,
                  locationId: card.floorLocationId,
                  change: { by: -grams },
                },
                {
                  itemType: 'RAW_MATERIAL' as const,
                  itemId: rawMaterialId,
                  locationId: toLocationId,
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
