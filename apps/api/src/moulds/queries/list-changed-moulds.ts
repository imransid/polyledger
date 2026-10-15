import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Mould } from '../../generated/prisma/client.js';

/** Moulds changed at or after `since`, active or not; all of them without it. */
export class ListChangedMouldsQuery extends Query<Mould[]> {
  constructor(readonly since: Date | null) {
    super();
  }
}

@QueryHandler(ListChangedMouldsQuery)
export class ListChangedMouldsHandler implements IQueryHandler<ListChangedMouldsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ since }: ListChangedMouldsQuery): Promise<Mould[]> {
    return this.prisma.mould.findMany({
      where: since ? { updatedAt: { gte: since } } : {},
    });
  }
}
