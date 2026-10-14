import { ConflictException, NotFoundException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { Prisma } from '../../generated/prisma/client.js';
import type { StockDocumentView } from '../queries/get-stock-document.js';
import { itemKey, loadItems } from './items.js';
import { postDocument, withEntries } from './ledger.js';

// Negates every row of a document, linked row by row to the originals. The
// reversal keeps the job card link so job card totals net out.
export async function reverseDocument(
  tx: Prisma.TransactionClient,
  queryBus: QueryBus,
  {
    actorId,
    documentId,
    reason,
  }: {
    actorId: string;
    documentId: string;
    reason: string;
  },
): Promise<StockDocumentView> {
  // Locked so two people reversing the same document can't both win.
  const [locked] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_documents WHERE id = ${documentId}::uuid FOR UPDATE`;
  if (!locked) {
    throw new NotFoundException('Stock document not found');
  }
  const original = await tx.stockDocument.findUniqueOrThrow({
    where: { id: documentId },
    include: withEntries,
  });
  if (original.kind === 'REVERSAL') {
    throw new ConflictException('A reversal cannot be reversed');
  }
  if (original.reversedAt) {
    throw new ConflictException(`${original.number} is already reversed`);
  }

  const items = await loadItems(queryBus, original.entries);
  const { document } = await postDocument(
    tx,
    {
      kind: 'REVERSAL',
      postedById: actorId,
      reason,
      reversesId: original.id,
      jobCardId: original.jobCardId,
    },
    original.entries.map((entry) => ({
      item: items.get(itemKey(entry))!,
      locationId: entry.locationId,
      change: { by: -(entry.pieces ?? entry.grams) },
      reversalOfId: entry.id,
    })),
  );
  await tx.stockDocument.update({
    where: { id: original.id },
    data: { reversedAt: document.postedAt },
  });
  return tx.stockDocument.findUniqueOrThrow({
    where: { id: document.id },
    include: withEntries,
  });
}
