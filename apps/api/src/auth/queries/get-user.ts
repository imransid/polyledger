import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { userView, type UserView } from '../infra/users.js';

export class GetUserQuery extends Query<UserView | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetUserQuery): Promise<UserView | null> {
    return this.prisma.user.findUnique({ where: { id }, select: userView });
  }
}
