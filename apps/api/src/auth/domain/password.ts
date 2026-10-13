import { randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

export const passwordSchema = z.string().min(8).max(128);

// The library defaults are argon2id, 19 MiB, 2 passes: the OWASP baseline.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

const unknownUserHash = hashPassword(randomUUID());

// Unknown users still cost one verify, so response time doesn't reveal who exists.
export async function verifyPassword(
  passwordHash: string | undefined,
  password: string,
): Promise<boolean> {
  return verify(passwordHash ?? (await unknownUserHash), password);
}
