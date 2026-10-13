import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../generated/prisma/client.js';
import {
  assertAnotherActiveOwner,
  revokeSessions,
  userView,
  type UserView,
} from '../infra/users.js';

export class DeactivateUserCommand extends Command<UserView> {
  constructor(
    readonly ownerId: string,
    readonly userId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(DeactivateUserCommand)
export class DeactivateUserHandler implements ICommandHandler<DeactivateUserCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    ownerId,
    userId,
    idempotencyKey,
  }: DeactivateUserCommand): Promise<UserView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId: ownerId, key: idempotencyKey, command: 'DeactivateUser' },
        async () => {
          const user = await tx.user.findUnique({ where: { id: userId } });
          if (!user) {
            throw new NotFoundException('User not found');
          }
          if (user.role === Role.OWNER && user.isActive) {
            await assertAnotherActiveOwner(tx, userId);
          }
          await revokeSessions(tx, userId);
          return tx.user.update({
            where: { id: userId },
            data: { isActive: false },
            select: userView,
          });
        },
      ),
    );
  }
}
