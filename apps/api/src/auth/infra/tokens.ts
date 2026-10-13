import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../../config/env.js';
import {
  hashRefreshToken,
  nextRefreshToken,
  REFRESH_TOKEN_LIFETIME_MS,
} from '../domain/refresh-token.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface Session {
  userId: string;
  sessionId: string;
  refreshToken: string;
  issuedAt: Date;
}

interface AccessClaims {
  sub: string;
  sid: string;
}

export function refreshTokenRecord(session: Session) {
  return {
    userId: session.userId,
    sessionId: session.sessionId,
    tokenHash: hashRefreshToken(session.refreshToken),
    createdAt: session.issuedAt,
    expiresAt: new Date(session.issuedAt.getTime() + REFRESH_TOKEN_LIFETIME_MS),
  };
}

@Injectable()
export class TokenService {
  private readonly refreshSecret: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.refreshSecret = config.get('REFRESH_TOKEN_SECRET', { infer: true });
  }

  // Signed with the session's own timestamp so a grace-window retry
  // reproduces exactly the same access token.
  pair(session: Session): TokenPair {
    const accessToken = this.jwt.sign({
      sub: session.userId,
      sid: session.sessionId,
      iat: Math.floor(session.issuedAt.getTime() / 1000),
    });
    return { accessToken, refreshToken: session.refreshToken };
  }

  verifyAccessToken(token: string): AccessClaims | null {
    try {
      return this.jwt.verify<AccessClaims>(token);
    } catch {
      return null;
    }
  }

  nextRefreshToken(previous: string): string {
    return nextRefreshToken(previous, this.refreshSecret);
  }
}
