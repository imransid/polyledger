import { UnauthorizedException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  hashRefreshToken,
  ROTATION_GRACE_MS,
} from '../domain/refresh-token.js';
import {
  refreshTokenRecord,
  TokenService,
  type TokenPair,
} from '../infra/tokens.js';
import { revokeSessions } from '../infra/users.js';

export class RefreshSessionCommand extends Command<TokenPair> {
  constructor(readonly refreshToken: string) {
    super();
  }
}

interface LockedToken {
  id: string;
  user_id: string;
  session_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_id: string | null;
  is_active: boolean;
}

@CommandHandler(RefreshSessionCommand)
export class RefreshSessionHandler implements ICommandHandler<RefreshSessionCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async execute({ refreshToken }: RefreshSessionCommand): Promise<TokenPair> {
    const pair = await this.prisma.$transaction((tx) =>
      this.refresh(tx, refreshToken),
    );
    if (!pair) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return pair;
  }

  // Returns null rather than throwing so a reuse revocation still commits.
  private async refresh(
    tx: Prisma.TransactionClient,
    refreshToken: string,
  ): Promise<TokenPair | null> {
    const [token] = await tx.$queryRaw<LockedToken[]>`
      SELECT t.id, t.user_id, t.session_id, t.expires_at, t.revoked_at,
             t.replaced_by_id, u.is_active
      FROM refresh_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ${hashRefreshToken(refreshToken)}
      FOR UPDATE OF t`;
    if (!token) {
      return null;
    }
    const now = new Date();

    if (token.revoked_at === null) {
      if (token.expires_at <= now || !token.is_active) {
        return null;
      }
      return this.rotate(tx, token, refreshToken, now);
    }

    // Revoked by logout, a password change or deactivation, not by rotation.
    if (token.replaced_by_id === null) {
      return null;
    }

    const sinceRotation = now.getTime() - token.revoked_at.getTime();
    if (sinceRotation <= ROTATION_GRACE_MS && token.is_active) {
      const successor = await tx.refreshToken.findUniqueOrThrow({
        where: { id: token.replaced_by_id },
      });
      if (successor.revokedAt === null) {
        return this.tokens.pair({
          userId: token.user_id,
          sessionId: token.session_id,
          refreshToken: this.tokens.nextRefreshToken(refreshToken),
          issuedAt: successor.createdAt,
        });
      }
    }

    // A rotated token came back outside the grace window: assume it was stolen.
    await revokeSessions(tx, token.user_id);
    return null;
  }

  private async rotate(
    tx: Prisma.TransactionClient,
    token: LockedToken,
    refreshToken: string,
    now: Date,
  ): Promise<TokenPair> {
    const session = {
      userId: token.user_id,
      sessionId: token.session_id,
      refreshToken: this.tokens.nextRefreshToken(refreshToken),
      issuedAt: now,
    };
    const successor = await tx.refreshToken.create({
      data: refreshTokenRecord(session),
    });
    await tx.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: now, replacedById: successor.id },
    });
    return this.tokens.pair(session);
  }
}
