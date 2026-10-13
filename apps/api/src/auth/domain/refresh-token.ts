import { createHash, createHmac, randomBytes } from 'node:crypto';

export const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// A tablet whose refresh response got lost on flaky Wi-Fi retries with the
// old token; inside this window it gets the same new pair instead of a lockout.
export const ROTATION_GRACE_MS = 30_000;

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

// Derived rather than random so a retry inside the grace window can be
// answered with the same token without ever storing it in plain text.
export function nextRefreshToken(previous: string, secret: string): string {
  return createHmac('sha256', secret).update(previous).digest('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
