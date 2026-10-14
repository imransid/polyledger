import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';

/** Active operators, for picking who ran a shift. */
export class ListOperatorsQuery extends Query<{ id: string; name: string }[]> {}

@QueryHandler(ListOperatorsQuery)
export class ListOperatorsHandler implements IQueryHandler<ListOperatorsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute(): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { role: 'OPERATOR', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
