import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

export interface IdempotentCommand {
  actorId: string;
  key: string | undefined;
  command: string;
}

// The insert claims the key. A concurrent request with the same key blocks on
// it until the first transaction commits, then replays the stored result.
export async function withIdempotencyKey<T>(
  tx: Prisma.TransactionClient,
  { actorId, key, command }: IdempotentCommand,
  work: () => Promise<T>,
): Promise<T> {
  if (key === undefined) {
    return work();
  }

  const claimed = await tx.idempotencyKey.createMany({
    data: { actorId, key, command },
    skipDuplicates: true,
  });
  if (claimed.count === 0) {
    const previous = await tx.idempotencyKey.findUniqueOrThrow({
      where: { actorId_key: { actorId, key } },
    });
    if (previous.command !== command) {
      throw new ConflictException('Idempotency key used for another request');
    }
    return previous.response as T;
  }

  const result = await work();
  if (result !== undefined) {
    await tx.idempotencyKey.update({
      where: { actorId_key: { actorId, key } },
      data: { response: JSON.parse(JSON.stringify(result)) },
    });
  }
  return result;
}
