import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import { userView, type UserView } from '../infra/users.js';

export interface UserFilter extends ListQuery {
  active?: boolean;
}

export class ListUsersQuery extends Query<Page<UserView>> {
  constructor(readonly filter: UserFilter) {
    super();
  }
}

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListUsersQuery): Promise<Page<UserView>> {
    const contains = { contains: filter.search, mode: 'insensitive' as const };
    const where = {
      isActive: filter.active,
      ...(filter.search && {
        OR: [{ name: contains }, { email: contains }, { phone: contains }],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userView,
        orderBy: { name: 'asc' },
        ...pageArgs(filter),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
