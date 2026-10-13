import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { userView, type UserView } from '../infra/users.js';

export class ReactivateUserCommand extends Command<UserView> {
  constructor(
    readonly ownerId: string,
    readonly userId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Sessions revoked at deactivation stay revoked; the user logs in again.
@CommandHandler(ReactivateUserCommand)
export class ReactivateUserHandler implements ICommandHandler<ReactivateUserCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    ownerId,
    userId,
    idempotencyKey,
  }: ReactivateUserCommand): Promise<UserView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId: ownerId, key: idempotencyKey, command: 'ReactivateUser' },
        async () => {
          if (!(await tx.user.findUnique({ where: { id: userId } }))) {
            throw new NotFoundException('User not found');
          }
          return tx.user.update({
            where: { id: userId },
            data: { isActive: true },
            select: userView,
          });
        },
      ),
    );
  }
}
