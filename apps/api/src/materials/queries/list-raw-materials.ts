import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  codeOrNameContains,
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  RawMaterial,
  RawMaterialType,
} from '../../generated/prisma/client.js';

export interface RawMaterialFilter extends ListQuery {
  active?: boolean;
  type?: RawMaterialType;
}

export class ListRawMaterialsQuery extends Query<Page<RawMaterial>> {
  constructor(readonly filter: RawMaterialFilter) {
    super();
  }
}

@QueryHandler(ListRawMaterialsQuery)
export class ListRawMaterialsHandler implements IQueryHandler<ListRawMaterialsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListRawMaterialsQuery): Promise<Page<RawMaterial>> {
    const where = {
      isActive: filter.active,
      type: filter.type,
      ...codeOrNameContains(filter.search),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rawMaterial.findMany({
        where,
        orderBy: { code: 'asc' },
        ...pageArgs(filter),
      }),
      this.prisma.rawMaterial.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
