import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { normalizeLogin } from '../domain/login.js';
import { verifyPassword } from '../domain/password.js';
import { newRefreshToken } from '../domain/refresh-token.js';
import {
  refreshTokenRecord,
  TokenService,
  type TokenPair,
} from '../infra/tokens.js';

export class LogInCommand extends Command<TokenPair> {
  constructor(
    readonly login: string,
    readonly password: string,
  ) {
    super();
  }
}

@CommandHandler(LogInCommand)
export class LogInHandler implements ICommandHandler<LogInCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async execute({ login, password }: LogInCommand): Promise<TokenPair> {
    const user = await this.findUser(login);
    const passwordMatches = await verifyPassword(user?.passwordHash, password);
    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException('Invalid login');
    }

    const session = {
      userId: user.id,
      sessionId: randomUUID(),
      refreshToken: newRefreshToken(),
      issuedAt: new Date(),
    };
    await this.prisma.refreshToken.create({
      data: refreshTokenRecord(session),
    });
    return this.tokens.pair(session);
  }

  private findUser(login: string) {
    const normalized = normalizeLogin(login);
    if (!normalized) {
      return null;
    }
    return this.prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { phone: normalized }] },
    });
  }
}
