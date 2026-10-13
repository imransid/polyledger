import { BadRequestException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword, verifyPassword } from '../domain/password.js';
import { revokeSessions } from '../infra/users.js';

export class ChangePasswordCommand extends Command<void> {
  constructor(
    readonly userId: string,
    readonly sessionId: string,
    readonly currentPassword: string,
    readonly newPassword: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<ChangePasswordCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const { userId, sessionId, currentPassword, idempotencyKey } = command;
    const passwordHash = await hashPassword(command.newPassword);

    await this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId: userId, key: idempotencyKey, command: 'ChangePassword' },
        async () => {
          const user = await tx.user.findUniqueOrThrow({
            where: { id: userId },
          });
          if (!(await verifyPassword(user.passwordHash, currentPassword))) {
            throw new BadRequestException('Current password is wrong');
          }
          await tx.user.update({
            where: { id: userId },
            data: { passwordHash },
          });
          await revokeSessions(tx, userId, sessionId);
        },
      ),
    );
  }
}
