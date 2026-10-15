import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Role } from '../../generated/prisma/client.js';
import { PIN_ROLES } from '../domain/pin.js';

export interface PinHolder {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  phone: string | null;
  hasPin: boolean;
  /** Locked out of at least one tablet until then. */
  lockedUntil: Date | null;
}

/** Active users who may sign in on a tablet, by name. */
export class ListPinsQuery extends Query<PinHolder[]> {}

@QueryHandler(ListPinsQuery)
export class ListPinsHandler implements IQueryHandler<ListPinsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<PinHolder[]> {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: PIN_ROLES } },
      include: {
        pinAttempts: {
          where: { lockedUntil: { gt: now } },
          orderBy: { lockedUntil: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      hasPin: user.pinHash !== null,
      lockedUntil: user.pinAttempts[0]?.lockedUntil ?? null,
    }));
  }
}
