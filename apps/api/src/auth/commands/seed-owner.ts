import { Logger } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../generated/prisma/client.js';
import { emailSchema, phoneSchema } from '../domain/login.js';
import { hashPassword } from '../domain/password.js';

export class SeedOwnerCommand extends Command<void> {
  constructor(
    readonly name: string | undefined,
    readonly login: string | undefined,
    readonly password: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(SeedOwnerCommand)
export class SeedOwnerHandler implements ICommandHandler<SeedOwnerCommand> {
  private readonly logger = new Logger(SeedOwnerHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute({ name, login, password }: SeedOwnerCommand): Promise<void> {
    if (!name && !login && !password) {
      await this.warnIfNoUsers();
      return;
    }
    if (!name || !login || !password) {
      throw new Error(
        'Set OWNER_NAME, OWNER_LOGIN and OWNER_PASSWORD together',
      );
    }
    const email = emailSchema.safeParse(login).data;
    const phone = phoneSchema.safeParse(login).data;
    if (!email && !phone) {
      throw new Error(
        'OWNER_LOGIN must be an email, 01XXXXXXXXX or +8801XXXXXXXXX',
      );
    }
    const passwordHash = await hashPassword(password);

    await this.prisma.$transaction(async (tx) => {
      // Two instances starting together must not both create an OWNER.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('seed-owner'))`;
      if ((await tx.user.count()) > 0) {
        return;
      }
      await tx.user.create({
        data: { name, email, phone, role: Role.OWNER, passwordHash },
      });
      this.logger.log('Created the first OWNER');
    });
  }

  // Best effort: a database that is still starting must not stop the API
  // from booting; /health reports that case.
  private async warnIfNoUsers(): Promise<void> {
    const users = await this.prisma.user.count().catch(() => undefined);
    if (users === 0) {
      this.logger.warn(
        'No users yet. Set OWNER_NAME, OWNER_LOGIN and OWNER_PASSWORD to create the first OWNER.',
      );
    }
  }
}
