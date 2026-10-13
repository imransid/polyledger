import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  codeOrNameContains,
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Customer } from '../../generated/prisma/client.js';

export interface CustomerFilter extends ListQuery {
  active?: boolean;
}

export class ListCustomersQuery extends Query<Page<Customer>> {
  constructor(readonly filter: CustomerFilter) {
    super();
  }
}

@QueryHandler(ListCustomersQuery)
export class ListCustomersHandler implements IQueryHandler<ListCustomersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListCustomersQuery): Promise<Page<Customer>> {
    const where = {
      isActive: filter.active,
      ...codeOrNameContains(filter.search),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { code: 'asc' },
        ...pageArgs(filter),
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
