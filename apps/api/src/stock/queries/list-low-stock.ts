import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { grams, type Grams } from '@polyledger/shared';
import { PrismaService } from '../../database/prisma.service.js';
import { ListActiveRawMaterialsQuery } from '../../materials/queries/list-active-raw-materials.js';

export interface LowStockLine {
  rawMaterialId: string;
  code: string;
  name: string;
  minimumStockGrams: Grams;
  stockGrams: Grams;
  shortByGrams: Grams;
}

export class ListLowStockQuery extends Query<LowStockLine[]> {}

// Counts raw material stores only: what is on the floor is already issued.
@QueryHandler(ListLowStockQuery)
export class ListLowStockHandler implements IQueryHandler<ListLowStockQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(): Promise<LowStockLine[]> {
    const totals = await this.prisma.$queryRaw<
      { rawMaterialId: string; grams: bigint }[]
    >`
      SELECT b.item_id AS "rawMaterialId", SUM(b.grams)::bigint AS grams
      FROM stock_balances b
      JOIN locations l ON l.id = b.location_id
      WHERE b.item_type = 'RAW_MATERIAL' AND l.kind = 'RAW_MATERIAL_STORE'
      GROUP BY b.item_id`;
    const stock = new Map(
      totals.map((row) => [row.rawMaterialId, grams(Number(row.grams))]),
    );

    const materials = await this.queryBus.execute(
      new ListActiveRawMaterialsQuery(),
    );
    return materials.flatMap((material) => {
      const stockGrams = stock.get(material.id) ?? grams(0);
      if (stockGrams >= material.minimumStockGrams) {
        return [];
      }
      return [
        {
          rawMaterialId: material.id,
          code: material.code,
          name: material.name,
          minimumStockGrams: grams(material.minimumStockGrams),
          stockGrams,
          shortByGrams: grams(material.minimumStockGrams - stockGrams),
        },
      ];
    });
  }
}
