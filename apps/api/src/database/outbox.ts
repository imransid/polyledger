import type { Prisma } from '../generated/prisma/client.js';

// Written in the caller's transaction, so an event exists exactly when the
// change it describes was committed.
export function recordEvent(
  tx: Prisma.TransactionClient,
  type: string,
  payload: Prisma.InputJsonValue,
) {
  return tx.outboxEvent.create({ data: { type, payload } });
}
