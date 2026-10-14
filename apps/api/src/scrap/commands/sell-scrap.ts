import { BadRequestException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { gramsForPieces, poishaForGrams } from '@polyledger/shared';
import { factoryToday, fromDateString } from '../../common/dates.js';
import { INT_MAX } from '../../common/quantities.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { GetProductsQuery } from '../../products/queries/get-products.js';
import { PostStockDocumentCommand } from '../../stock/commands/post-stock-document.js';
import { assertLocation } from '../infra/locations.js';
import { type ScrapSaleView, toScrapSaleView } from '../infra/views.js';

export type ScrapSaleLineInput = { pricePerKgPoisha: number } & (
  | { itemType: 'RAW_MATERIAL'; itemId: string; grams: number }
  | { itemType: 'PRODUCT'; itemId: string; pieces: number }
);

export interface NewScrapSale {
  buyerName: string;
  scrapLocationId: string;
  lines: ScrapSaleLineInput[];
}

export class SellScrapCommand extends Command<ScrapSaleView> {
  constructor(
    readonly actorId: string,
    readonly sale: NewScrapSale,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Scrap is sold by weight; scrapped products are weighed as pieces x piece
// weight.
@CommandHandler(SellScrapCommand)
export class SellScrapHandler implements ICommandHandler<SellScrapCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    sale,
    idempotencyKey,
  }: SellScrapCommand): Promise<ScrapSaleView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'SellScrap' },
        () => this.sell(tx, actorId, sale),
      ),
    );
  }

  private async sell(
    tx: Prisma.TransactionClient,
    actorId: string,
    sale: NewScrapSale,
  ): Promise<ScrapSaleView> {
    await assertLocation(
      this.queryBus,
      sale.scrapLocationId,
      'SCRAP_YARD',
      'Sell scrap from an active scrap yard',
    );
    const lines = await this.priced(sale.lines);

    const document = await this.commandBus.execute(
      new PostStockDocumentCommand(
        tx,
        { kind: 'SCRAP_SALE', postedById: actorId },
        lines.map((line) => ({
          itemType: line.itemType,
          itemId: line.itemId,
          locationId: sale.scrapLocationId,
          change: { by: -(line.pieces ?? line.grams) },
        })),
      ),
    );
    const created = await tx.scrapSale.create({
      data: {
        stockDocumentId: document.id,
        buyerName: sale.buyerName,
        soldOn: fromDateString(factoryToday()),
        scrapLocationId: sale.scrapLocationId,
        recordedById: actorId,
        lines: {
          create: lines.map((line, index) => ({ lineNo: index + 1, ...line })),
        },
      },
      include: { lines: true },
    });
    const view = toScrapSaleView(created);
    await recordEvent(tx, 'scrap.sold', {
      saleId: created.id,
      documentNumber: document.number,
      buyerName: sale.buyerName,
      amountPoisha: view.amountPoisha,
    });
    return view;
  }

  private async priced(lines: ScrapSaleLineInput[]) {
    const productIds = lines
      .filter((line) => line.itemType === 'PRODUCT')
      .map((line) => line.itemId);
    const products = await this.queryBus.execute(
      new GetProductsQuery(productIds),
    );
    const pieceWeights = new Map(
      products.map((product) => [product.id, product.pieceWeightMg]),
    );
    const unknown = productIds.find((id) => !pieceWeights.has(id));
    if (unknown) {
      throw new BadRequestException(`Unknown product ${unknown}`);
    }

    return lines.map((line) => {
      const grams =
        line.itemType === 'PRODUCT'
          ? gramsForPieces(line.pieces, pieceWeights.get(line.itemId)!)
          : line.grams;
      const amountPoisha = poishaForGrams(grams, line.pricePerKgPoisha);
      if (amountPoisha > INT_MAX) {
        throw new BadRequestException('A line amount is too large');
      }
      return {
        itemType: line.itemType,
        itemId: line.itemId,
        pieces: line.itemType === 'PRODUCT' ? line.pieces : null,
        grams,
        pricePerKgPoisha: line.pricePerKgPoisha,
        amountPoisha,
      };
    });
  }
}
