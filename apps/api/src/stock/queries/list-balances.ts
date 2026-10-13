import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { grams, type Grams } from '@polyledger/shared';
import {
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { StockItemType } from '../../generated/prisma/client.js';

export interface BalanceFilter extends ListQuery {
  itemType?: StockItemType;
  itemId?: string;
  locationId?: string;
}

export interface BalanceView {
  itemType: StockItemType;
  itemId: string;
  locationId: string;
  grams: Grams;
  pieces: number | null;
}

export class ListBalancesQuery extends Query<Page<BalanceView>> {
  constructor(readonly filter: BalanceFilter) {
    super();
  }
}

@QueryHandler(ListBalancesQuery)
export class ListBalancesHandler implements IQueryHandler<ListBalancesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListBalancesQuery): Promise<Page<BalanceView>> {
    const where = {
      itemType: filter.itemType,
      itemId: filter.itemId,
      locationId: filter.locationId,
      NOT: { grams: 0n, pieces: 0n },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockBalance.findMany({
        where,
        orderBy: [
          { itemType: 'asc' },
          { itemId: 'asc' },
          { locationId: 'asc' },
        ],
        ...pageArgs(filter),
      }),
      this.prisma.stockBalance.count({ where }),
    ]);
    const items = rows.map((row) => ({
      itemType: row.itemType,
      itemId: row.itemId,
      locationId: row.locationId,
      grams: grams(Number(row.grams)),
      pieces: row.itemType === 'PRODUCT' ? toSafeNumber(row.pieces) : null,
    }));
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
