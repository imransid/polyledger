import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  codeOrNameContains,
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Supplier } from '../../generated/prisma/client.js';

export interface SupplierFilter extends ListQuery {
  active?: boolean;
}

export class ListSuppliersQuery extends Query<Page<Supplier>> {
  constructor(readonly filter: SupplierFilter) {
    super();
  }
}

@QueryHandler(ListSuppliersQuery)
export class ListSuppliersHandler implements IQueryHandler<ListSuppliersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListSuppliersQuery): Promise<Page<Supplier>> {
    const where = {
      isActive: filter.active,
      ...codeOrNameContains(filter.search),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { code: 'asc' },
        ...pageArgs(filter),
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
