import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { userView, type UserView } from '../infra/users.js';

export class GetCurrentUserQuery extends Query<UserView> {
  constructor(readonly userId: string) {
    super();
  }
}

@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler implements IQueryHandler<GetCurrentUserQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ userId }: GetCurrentUserQuery): Promise<UserView> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: userView,
    });
  }
}
