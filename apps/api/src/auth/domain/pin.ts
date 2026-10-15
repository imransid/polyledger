import { isTrivialPin, PIN_PATTERN } from '@polyledger/shared';
import { z } from 'zod';
import { Role } from '../../generated/prisma/client.js';

export const pinSchema = z
  .string()
  .regex(PIN_PATTERN, 'A PIN is 4 to 6 digits')
  .refine(
    (pin) => !isTrivialPin(pin),
    'Choose a PIN that is not one digit repeated or a straight run',
  );

/** The roles that record shifts: the only ones that sign in on a tablet. */
export const PIN_ROLES: Role[] = [
  Role.OWNER,
  Role.MANAGER,
  Role.SUPERVISOR,
  Role.OPERATOR,
];

/** Wrong PINs in a row that lock a user out of one tablet. */
export const PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60_000;
