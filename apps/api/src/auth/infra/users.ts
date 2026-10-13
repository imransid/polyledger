import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

export const userView = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserView = Prisma.UserGetPayload<{ select: typeof userView }>;

export function revokeSessions(
  tx: Prisma.TransactionClient,
  userId: string,
  keepSessionId?: string,
) {
  return tx.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      sessionId: keepSessionId ? { not: keepSessionId } : undefined,
    },
    data: { revokedAt: new Date() },
  });
}

// Locks the active OWNER rows so two OWNERs can't demote each other at once.
export async function assertAnotherActiveOwner(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const owners = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE role = 'OWNER' AND is_active FOR UPDATE`;
  if (!owners.some((owner) => owner.id !== userId)) {
    throw new ConflictException('Cannot remove the last active OWNER');
  }
}
