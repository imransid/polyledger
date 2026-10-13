import { ConflictException } from '@nestjs/common';
import { isGrams } from '@polyledger/shared';
import { z } from 'zod';
import { isUniqueViolation } from '../database/errors.js';
import { Role } from '../generated/prisma/client.js';

export const MASTER_DATA_EDITORS: Role[] = [Role.OWNER, Role.MANAGER];
export const MASTER_DATA_READERS: Role[] = [
  ...MASTER_DATA_EDITORS,
  Role.STOREKEEPER,
  Role.SUPERVISOR,
];

// Postgres integer columns.
const INT_MAX = 2_147_483_647;

export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(20)
  .regex(
    /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
    'Code must be letters and digits, optionally separated by single dashes',
  );

export const nameSchema = z.string().trim().min(1).max(100);

export const countSchema = z.number().int().min(1).max(INT_MAX);

export const gramsSchema = z
  .number()
  .refine(isGrams, 'Must be whole grams')
  .min(0)
  .max(INT_MAX);

export function throwIfCodeInUse(error: unknown, code: string): void {
  if (isUniqueViolation(error)) {
    throw new ConflictException(`Code ${code} is already in use`);
  }
}
