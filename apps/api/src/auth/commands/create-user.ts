import { ConflictException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { isUniqueViolation } from '../../database/errors.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Role } from '../../generated/prisma/client.js';
import { hashPassword } from '../domain/password.js';
import { userView, type UserView } from '../infra/users.js';

export interface NewUser {
  name: string;
  email?: string;
  phone?: string;
  role: Role;
  password: string;
}

export class CreateUserCommand extends Command<UserView> {
  constructor(
    readonly ownerId: string,
    readonly user: NewUser,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    ownerId,
    user,
    idempotencyKey,
  }: CreateUserCommand): Promise<UserView> {
    const { password, ...details } = user;
    const passwordHash = await hashPassword(password);

    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId: ownerId, key: idempotencyKey, command: 'CreateUser' },
          () =>
            tx.user.create({
              data: { ...details, passwordHash },
              select: userView,
            }),
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email or phone already in use');
      }
      throw error;
    }
  }
}
