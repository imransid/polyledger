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
import type { StockDocumentView } from '../../stock/queries/get-stock-document.js';
import { assertLocation } from '../infra/locations.js';

export const SCRAP_REASONS = [
  'DAMAGED',
  'OBSOLETE',
  'CUSTOMER_RETURN',
] as const;

export interface ProductsToScrap {
  fromLocationId: string;
  toLocationId: string;
  reason: (typeof SCRAP_REASONS)[number];
  lines: { productId: string; pieces: number }[];
}

export class ScrapProductsCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly transfer: ProductsToScrap,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Goods that can no longer be sold as goods go to a scrap yard, to be ground
// or sold by weight. A plain stock document, so the usual stock reversal
// undoes it.
@CommandHandler(ScrapProductsCommand)
export class ScrapProductsHandler implements ICommandHandler<ScrapProductsCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    transfer,
    idempotencyKey,
  }: ScrapProductsCommand): Promise<StockDocumentView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ScrapProducts' },
        async () => {
          await assertLocation(
            this.queryBus,
            transfer.fromLocationId,
            'FINISHED_GOODS_STORE',
            'Scrap products from an active finished goods store',
          );
          await assertLocation(
            this.queryBus,
            transfer.toLocationId,
            'SCRAP_YARD',
            'Scrapped products go to an active scrap yard',
          );
          return this.commandBus.execute(
            new PostStockDocumentCommand(
              tx,
              {
                kind: 'SCRAP_TRANSFER',
                postedById: actorId,
                reason: transfer.reason,
              },
              transfer.lines.flatMap(({ productId, pieces }) => [
                {
                  itemType: 'PRODUCT' as const,
                  itemId: productId,
                  locationId: transfer.fromLocationId,
                  change: { by: -pieces },
                },
                {
                  itemType: 'PRODUCT' as const,
                  itemId: productId,
                  locationId: transfer.toLocationId,
                  change: { by: pieces },
                },
              ]),
            ),
          );
        },
      ),
    );
  }
}
