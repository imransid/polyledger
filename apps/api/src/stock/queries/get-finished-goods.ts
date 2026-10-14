import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface FinishedGoodsStore {
  locationId: string;
  code: string;
  name: string;
  pieces: number;
}

/** Product pieces in each active finished goods store, and in any other that still holds some. */
export class GetFinishedGoodsQuery extends Query<FinishedGoodsStore[]> {}

@QueryHandler(GetFinishedGoodsQuery)
export class GetFinishedGoodsHandler implements IQueryHandler<GetFinishedGoodsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<FinishedGoodsStore[]> {
    const stores = await this.prisma.$queryRaw<
      (Omit<FinishedGoodsStore, 'pieces'> & { pieces: bigint })[]
    >`
      SELECT l.id AS "locationId", l.code, l.name,
             COALESCE(SUM(b.pieces), 0)::bigint AS pieces
      FROM locations l
      LEFT JOIN stock_balances b
        ON b.location_id = l.id AND b.item_type = 'PRODUCT'
      WHERE l.kind = 'FINISHED_GOODS_STORE'
      GROUP BY l.id
      HAVING l.is_active OR COALESCE(SUM(b.pieces), 0) <> 0
      ORDER BY l.code`;
    return stores.map((store) => ({
      ...store,
      pieces: toSafeNumber(store.pieces),
    }));
  }
}
