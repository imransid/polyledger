import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../config/env.js';
import { REFRESH_TOKEN_LIFETIME_MS } from '../domain/refresh-token.js';
import type { TokenPair } from './tokens.js';

const COOKIE = 'polyledger_refresh';

// The office app keeps its refresh token in an httpOnly cookie, out of reach
// of page scripts. The tablet keeps sending it in the body.
@Injectable()
export class RefreshCookie {
  private readonly options: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    this.options = {
      httpOnly: true,
      // Development runs on plain http, where some browsers drop Secure cookies.
      secure: config.get('NODE_ENV', { infer: true }) !== 'development',
      sameSite: 'strict',
      // The office app reaches the API under /api: the Vite proxy in
      // development, the reverse proxy in production.
      path: '/api/auth',
    };
  }

  deliver(
    request: Request,
    response: Response,
    tokens: TokenPair,
  ): { accessToken: string; refreshToken?: string } {
    if (!wantsCookie(request)) {
      return tokens;
    }
    response.cookie(COOKIE, tokens.refreshToken, {
      ...this.options,
      maxAge: REFRESH_TOKEN_LIFETIME_MS,
    });
    return { accessToken: tokens.accessToken };
  }

  tokenFrom(request: Request, body: { refreshToken?: string }): string {
    const token = wantsCookie(request)
      ? cookieValue(request)
      : body.refreshToken;
    if (!token) {
      throw new UnauthorizedException('Not logged in');
    }
    return token;
  }

  clear(request: Request, response: Response): void {
    if (wantsCookie(request)) {
      response.clearCookie(COOKIE, this.options);
    }
  }
}

// A page on another site can't send a custom header without a CORS
// preflight, which the API never allows, so this also stops CSRF.
function wantsCookie(request: Request): boolean {
  return request.headers['x-client'] === 'office';
}

function cookieValue(request: Request): string | undefined {
  return request.headers.cookie
    ?.split(';')
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}
