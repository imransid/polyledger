import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { hashPassword } from '../domain/password.js';
import { PIN_ROLES } from '../domain/pin.js';

export class SetPinCommand extends Command<void> {
  constructor(
    readonly actorId: string,
    readonly userId: string,
    readonly pin: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// A new PIN also lifts any tablet lock-out, so it is how a manager unlocks
// someone.
@CommandHandler(SetPinCommand)
export class SetPinHandler implements ICommandHandler<SetPinCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: SetPinCommand): Promise<void> {
    const { actorId, userId, idempotencyKey } = command;
    const pinHash = await hashPassword(command.pin);

    await this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'SetPin' },
        async () => {
          const user = await tx.user.findUnique({ where: { id: userId } });
          if (!user) {
            throw new NotFoundException('User not found');
          }
          if (!PIN_ROLES.includes(user.role)) {
            throw new BadRequestException(
              `A ${user.role} does not record shifts, so gets no tablet PIN`,
            );
          }
          await tx.user.update({ where: { id: userId }, data: { pinHash } });
          await tx.pinAttempt.deleteMany({ where: { userId } });
        },
      ),
    );
  }
}
