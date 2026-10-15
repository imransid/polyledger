import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Role } from '../../generated/prisma/client.js';

export interface ChangedUser {
  id: string;
  name: string;
  role: Role;
  isActive: boolean;
}

/** Users changed at or after `since`, active or not; every user without it. */
export class ListChangedUsersQuery extends Query<ChangedUser[]> {
  constructor(readonly since: Date | null) {
    super();
  }
}

@QueryHandler(ListChangedUsersQuery)
export class ListChangedUsersHandler implements IQueryHandler<ListChangedUsersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ since }: ListChangedUsersQuery): Promise<ChangedUser[]> {
    return this.prisma.user.findMany({
      where: since ? { updatedAt: { gte: since } } : {},
      select: { id: true, name: true, role: true, isActive: true },
    });
  }
}
