import { parseKilograms } from '@polyledger/shared';
import { z } from 'zod';

// Postgres integer columns.
export const INT_MAX = 2_147_483_647;

// Kilograms arrive as text ("1250.5") so they never pass through a float.
export const kilogramsSchema = z.string().transform((value, ctx) => {
  try {
    const grams = parseKilograms(value);
    if (grams <= INT_MAX) {
      return grams;
    }
  } catch {
    // Reported below.
  }
  ctx.issues.push({
    code: 'custom',
    message: 'Kilograms must look like 1250.5, with at most 3 decimals',
    input: value,
  });
  return z.NEVER;
});

export const piecesSchema = z.number().int().min(0).max(INT_MAX);

// For bigint totals coming back from SQL.
export function toSafeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`${value} is beyond the safe integer range`);
  }
  return number;
}

// part / whole in basis points (2.35% is 235), rounded half up; null when
// there is no whole to compare against.
export function basisPointsOf(part: number, whole: number): number | null {
  if (whole === 0) {
    return null;
  }
  return toSafeNumber(
    (BigInt(part) * 20_000n + BigInt(whole)) / (BigInt(whole) * 2n),
  );
}
