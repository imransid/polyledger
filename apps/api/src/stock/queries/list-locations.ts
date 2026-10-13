import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  codeOrNameContains,
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Location, LocationKind } from '../../generated/prisma/client.js';

export interface LocationFilter extends ListQuery {
  active?: boolean;
  kind?: LocationKind;
}

export class ListLocationsQuery extends Query<Page<Location>> {
  constructor(readonly filter: LocationFilter) {
    super();
  }
}

@QueryHandler(ListLocationsQuery)
export class ListLocationsHandler implements IQueryHandler<ListLocationsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListLocationsQuery): Promise<Page<Location>> {
    const where = {
      isActive: filter.active,
      kind: filter.kind,
      ...codeOrNameContains(filter.search),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.location.findMany({
        where,
        orderBy: { code: 'asc' },
        ...pageArgs(filter),
      }),
      this.prisma.location.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
