import { BadRequestException, ConflictException } from '@nestjs/common';
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
import { JobCardReporter } from '../infra/job-card-reporter.js';
import { assertInWork, lockJobCard } from '../infra/job-cards.js';

export class HandOverGoodsCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly toLocationId: string,
    readonly pieces: number,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// The floor may hold the same product from several cards; a card can only
// hand over what it produced itself.
@CommandHandler(HandOverGoodsCommand)
export class HandOverGoodsHandler implements ICommandHandler<HandOverGoodsCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly reporter: JobCardReporter,
  ) {}

  execute({
    actorId,
    jobCardId,
    toLocationId,
    pieces,
    idempotencyKey,
  }: HandOverGoodsCommand): Promise<StockDocumentView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'HandOverGoods' },
        async () => {
          const card = await lockJobCard(tx, jobCardId);
          assertInWork(card);
          const store = await this.queryBus.execute(
            new GetLocationQuery(toLocationId),
          );
          if (!store?.isActive || store.kind !== 'FINISHED_GOODS_STORE') {
            throw new BadRequestException(
              'Hand over to an active finished goods store',
            );
          }
          const { piecesOnFloor } = await this.reporter.floorStock(card);
          if (pieces > piecesOnFloor) {
            throw new ConflictException(
              `${card.number} has only ${piecesOnFloor} good pieces on the floor`,
            );
          }

          return this.commandBus.execute(
            new PostStockDocumentCommand(
              tx,
              { kind: 'HANDOVER', postedById: actorId, jobCardId },
              [
                {
                  itemType: 'PRODUCT',
                  itemId: card.productId,
                  locationId: card.floorLocationId,
                  change: { by: -pieces },
                },
                {
                  itemType: 'PRODUCT',
                  itemId: card.productId,
                  locationId: toLocationId,
                  change: { by: pieces },
                },
              ],
            ),
          );
        },
      ),
    );
  }
}
