import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Mould } from '../../generated/prisma/client.js';

export class GetMouldQuery extends Query<Mould | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetMouldQuery)
export class GetMouldHandler implements IQueryHandler<GetMouldQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetMouldQuery): Promise<Mould | null> {
    return this.prisma.mould.findUnique({ where: { id } });
  }
}
