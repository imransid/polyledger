import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type MaterialCheck,
  MaterialPlanner,
} from '../infra/material-planner.js';

export class GetMaterialShortagesQuery extends Query<MaterialCheck> {}

// Every CONFIRMED order together: pieces are added up per product first, so
// finished goods in stock are counted once, not once per order. Products
// without an active formula are listed rather than failing the whole view.
@QueryHandler(GetMaterialShortagesQuery)
export class GetMaterialShortagesHandler implements IQueryHandler<GetMaterialShortagesQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: MaterialPlanner,
  ) {}

  async execute(): Promise<MaterialCheck> {
    const demand = await this.prisma.$queryRaw<
      { productId: string; pieces: bigint }[]
    >`
      SELECT l.product_id AS "productId", SUM(l.pieces)::bigint AS pieces
      FROM sales_order_lines l
      JOIN sales_orders o ON o.id = l.order_id
      WHERE o.status = 'CONFIRMED'
      GROUP BY l.product_id`;

    return this.planner.plan(
      demand.map((row) => ({
        productId: row.productId,
        pieces: toSafeNumber(row.pieces),
      })),
    );
  }
}
