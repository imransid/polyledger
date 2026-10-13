import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../generated/prisma/client.js';
import {
  assertAnotherActiveOwner,
  userView,
  type UserView,
} from '../infra/users.js';

export class ChangeUserRoleCommand extends Command<UserView> {
  constructor(
    readonly ownerId: string,
    readonly userId: string,
    readonly role: Role,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ChangeUserRoleCommand)
export class ChangeUserRoleHandler implements ICommandHandler<ChangeUserRoleCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    ownerId,
    userId,
    role,
    idempotencyKey,
  }: ChangeUserRoleCommand): Promise<UserView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId: ownerId, key: idempotencyKey, command: 'ChangeUserRole' },
        async () => {
          const user = await tx.user.findUnique({ where: { id: userId } });
          if (!user) {
            throw new NotFoundException('User not found');
          }
          if (
            user.role === Role.OWNER &&
            user.isActive &&
            role !== Role.OWNER
          ) {
            await assertAnotherActiveOwner(tx, userId);
          }
          return tx.user.update({
            where: { id: userId },
            data: { role },
            select: userView,
          });
        },
      ),
    );
  }
}
