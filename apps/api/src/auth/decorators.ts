import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
}

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const ALL_ROLES = Object.values(Role);

export const Public = () => SetMetadata(IS_PUBLIC, true);

export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest().user,
);

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const key: unknown = context.switchToHttp().getRequest().headers[
      'idempotency-key'
    ];
    if (key === undefined) {
      return undefined;
    }
    if (typeof key !== 'string' || key.length === 0 || key.length > 255) {
      throw new BadRequestException('Invalid Idempotency-Key header');
    }
    return key;
  },
);
