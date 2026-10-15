import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Location } from '../../generated/prisma/client.js';

/** Locations changed at or after `since`, active or not; all of them without it. */
export class ListChangedLocationsQuery extends Query<Location[]> {
  constructor(readonly since: Date | null) {
    super();
  }
}

@QueryHandler(ListChangedLocationsQuery)
export class ListChangedLocationsHandler implements IQueryHandler<ListChangedLocationsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ since }: ListChangedLocationsQuery): Promise<Location[]> {
    return this.prisma.location.findMany({
      where: since ? { updatedAt: { gte: since } } : {},
    });
  }
}
