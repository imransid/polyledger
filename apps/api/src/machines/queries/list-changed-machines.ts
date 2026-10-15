import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Machine } from '../../generated/prisma/client.js';

/** Machines changed at or after `since`, active or not; all of them without it. */
export class ListChangedMachinesQuery extends Query<Machine[]> {
  constructor(readonly since: Date | null) {
    super();
  }
}

@QueryHandler(ListChangedMachinesQuery)
export class ListChangedMachinesHandler implements IQueryHandler<ListChangedMachinesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ since }: ListChangedMachinesQuery): Promise<Machine[]> {
    return this.prisma.machine.findMany({
      where: since ? { updatedAt: { gte: since } } : {},
    });
  }
}
