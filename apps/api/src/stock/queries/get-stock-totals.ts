import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { grams, type Grams } from '@polyledger/shared';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  LocationKind,
  StockItemType,
} from '../../generated/prisma/client.js';

export interface StockTotal {
  itemId: string;
  grams: Grams;
  pieces: number;
}

// Stock of the given items across every location of one kind, such as all
// raw material stores.
export class GetStockTotalsQuery extends Query<StockTotal[]> {
  constructor(
    readonly itemType: StockItemType,
    readonly itemIds: string[],
    readonly locationKind: LocationKind,
  ) {
    super();
  }
}

@QueryHandler(GetStockTotalsQuery)
export class GetStockTotalsHandler implements IQueryHandler<GetStockTotalsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    itemType,
    itemIds,
    locationKind,
  }: GetStockTotalsQuery): Promise<StockTotal[]> {
    const rows = await this.prisma.$queryRaw<
      { itemId: string; grams: bigint; pieces: bigint }[]
    >`
      SELECT b.item_id AS "itemId",
             SUM(b.grams)::bigint AS grams,
             SUM(b.pieces)::bigint AS pieces
      FROM stock_balances b
      JOIN locations l ON l.id = b.location_id
      WHERE b.item_type = ${itemType}::"StockItemType"
        AND l.kind = ${locationKind}::"LocationKind"
        AND b.item_id = ANY(${itemIds}::uuid[])
      GROUP BY b.item_id`;
    return rows.map((row) => ({
      itemId: row.itemId,
      grams: grams(Number(row.grams)),
      pieces: toSafeNumber(row.pieces),
    }));
  }
}
