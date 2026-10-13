import type { Prisma } from '../generated/prisma/client.js';

// Human document numbers such as GRN-000123, from a Postgres sequence.
// Sequences never roll back, so a failed post can skip a number.
export async function nextNumber(
  tx: Prisma.TransactionClient,
  sequence: string,
  prefix: string,
): Promise<string> {
  const [{ value }] = await tx.$queryRaw<{ value: bigint }[]>`
    SELECT nextval(${sequence}::regclass) AS value`;
  return `${prefix}-${value.toString().padStart(6, '0')}`;
}
