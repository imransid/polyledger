import type { IncomingHttpHeaders } from 'node:http';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service.js';
import type { Role } from '../generated/prisma/client.js';
import { type AuthUser, IS_DEVICE, IS_PUBLIC, ROLES } from './decorators.js';
import { TokenService } from './infra/tokens.js';

interface AuthRequest {
  headers: IncomingHttpHeaders;
  user?: AuthUser;
}

// Deny by default: a route needs @Public(), a @Roles() that includes the
// caller's role, or @Device() for a paired tablet.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ||
      this.reflector.getAllAndOverride<boolean>(IS_DEVICE, targets)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = await this.authenticate(request.headers.authorization);
    if (!user) {
      throw new UnauthorizedException();
    }
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES,
      targets,
    );
    if (!roles?.includes(user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }

  // Reads the user live so deactivation, role changes and revoked sessions
  // take effect immediately instead of when the access token expires.
  private async authenticate(
    header: string | undefined,
  ): Promise<AuthUser | null> {
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      return null;
    }
    const claims = this.tokens.verifyAccessToken(token);
    if (!claims) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: claims.sub,
        isActive: true,
        refreshTokens: {
          some: {
            sessionId: claims.sid,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        },
      },
      select: { id: true, role: true },
    });
    return user && { ...user, sessionId: claims.sid };
  }
}
