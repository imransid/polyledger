import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';

/** Who posted or recorded something, for other modules' lists. */
export class GetUserNamesQuery extends Query<Map<string, string>> {
  constructor(readonly ids: string[]) {
    super();
  }
}

@QueryHandler(GetUserNamesQuery)
export class GetUserNamesHandler implements IQueryHandler<GetUserNamesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ ids }: GetUserNamesQuery): Promise<Map<string, string>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }
}
