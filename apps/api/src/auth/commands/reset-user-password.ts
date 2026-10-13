import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword } from '../domain/password.js';
import { revokeSessions } from '../infra/users.js';

export class ResetUserPasswordCommand extends Command<void> {
  constructor(
    readonly ownerId: string,
    readonly userId: string,
    readonly newPassword: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ResetUserPasswordCommand)
export class ResetUserPasswordHandler implements ICommandHandler<ResetUserPasswordCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ResetUserPasswordCommand): Promise<void> {
    const { ownerId, userId, idempotencyKey } = command;
    const passwordHash = await hashPassword(command.newPassword);

    await this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId: ownerId, key: idempotencyKey, command: 'ResetUserPassword' },
        async () => {
          const { count } = await tx.user.updateMany({
            where: { id: userId },
            data: { passwordHash },
          });
          if (count === 0) {
            throw new NotFoundException('User not found');
          }
          await revokeSessions(tx, userId);
        },
      ),
    );
  }
}
