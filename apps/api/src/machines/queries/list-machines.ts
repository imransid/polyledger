import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  codeOrNameContains,
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Machine, MachineStatus } from '../../generated/prisma/client.js';

export interface MachineFilter extends ListQuery {
  status?: MachineStatus;
}

export class ListMachinesQuery extends Query<Page<Machine>> {
  constructor(readonly filter: MachineFilter) {
    super();
  }
}

@QueryHandler(ListMachinesQuery)
export class ListMachinesHandler implements IQueryHandler<ListMachinesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListMachinesQuery): Promise<Page<Machine>> {
    const where = {
      status: filter.status,
      ...codeOrNameContains(filter.search),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.machine.findMany({
        where,
        orderBy: { code: 'asc' },
        ...pageArgs(filter),
      }),
      this.prisma.machine.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
