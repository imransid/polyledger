import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Location } from '../../generated/prisma/client.js';

export class GetLocationQuery extends Query<Location | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetLocationQuery)
export class GetLocationHandler implements IQueryHandler<GetLocationQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetLocationQuery): Promise<Location | null> {
    return this.prisma.location.findUnique({ where: { id } });
  }
}
