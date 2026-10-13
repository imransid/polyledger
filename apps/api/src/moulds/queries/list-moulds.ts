import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  codeOrNameContains,
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Mould, MouldStatus } from '../../generated/prisma/client.js';

export interface MouldFilter extends ListQuery {
  status?: MouldStatus;
  productId?: string;
}

export class ListMouldsQuery extends Query<Page<Mould>> {
  constructor(readonly filter: MouldFilter) {
    super();
  }
}

@QueryHandler(ListMouldsQuery)
export class ListMouldsHandler implements IQueryHandler<ListMouldsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListMouldsQuery): Promise<Page<Mould>> {
    const where = {
      status: filter.status,
      productId: filter.productId,
      ...codeOrNameContains(filter.search),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mould.findMany({
        where,
        orderBy: { code: 'asc' },
        ...pageArgs(filter),
      }),
      this.prisma.mould.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
