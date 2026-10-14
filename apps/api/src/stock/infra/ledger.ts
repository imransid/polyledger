import { ConflictException } from '@nestjs/common';
import { grams } from '@polyledger/shared';
import { toSafeNumber } from '../../common/quantities.js';
import { nextNumber } from '../../database/numbers.js';
import { recordEvent } from '../../database/outbox.js';
import {
  Prisma,
  type StockDocument,
  type StockDocumentKind,
  type StockItemType,
  type StockLedgerEntry,
} from '../../generated/prisma/client.js';
import {
  applyChange,
  type Balance,
  type Change,
  isNegative,
  type StockItem,
} from '../domain/balance.js';

const NUMBER_PREFIX: Record<StockDocumentKind, string> = {
  RECEIPT: 'GRN',
  TRANSFER: 'TRF',
  ADJUSTMENT: 'ADJ',
  OPENING: 'OPN',
  REVERSAL: 'REV',
  ISSUE: 'ISS',
  PRODUCTION: 'PRD',
  HANDOVER: 'FGH',
  RETURN: 'RET',
  WASTE: 'WST',
  GRINDING: 'GRD',
  SCRAP_SALE: 'SCR',
  SCRAP_TRANSFER: 'SCT',
  DISPATCH: 'DC',
  CUSTOMER_RETURN: 'CRN',
};

export interface Movement {
  item: StockItem;
  locationId: string;
  change: Change;
  reversalOfId?: number;
}

interface BalanceKey {
  itemType: StockItemType;
  itemId: string;
  locationId: string;
}

interface LockedRow extends BalanceKey {
  grams: bigint;
  pieces: bigint;
}

export const withEntries = {
  entries: { orderBy: { id: 'asc' } },
  receiptLines: true,
} satisfies Prisma.StockDocumentInclude;

export function keyOf({ itemType, itemId, locationId }: BalanceKey): string {
  return `${itemType}:${itemId}:${locationId}`;
}

// Every stock change goes through here: one document, its ledger rows, the
// balances they move and one outbox event, all in the caller's transaction.
export async function postDocument(
  tx: Prisma.TransactionClient,
  header: Omit<Prisma.StockDocumentUncheckedCreateInput, 'number'>,
  movements: Movement[],
): Promise<{ document: StockDocument; entries: StockLedgerEntry[] }> {
  const number = await nextNumber(
    tx,
    `stock_document_number_${header.kind.toLowerCase()}`,
    NUMBER_PREFIX[header.kind],
  );
  const document = await tx.stockDocument.create({
    data: { ...header, number },
  });
  const entries = await postMovements(tx, document, movements);

  await recordEvent(tx, `stock.${document.kind.toLowerCase()}.posted`, {
    documentId: document.id,
    number,
    entries: entries.map(({ itemType, itemId, locationId, grams, pieces }) => ({
      itemType,
      itemId,
      locationId,
      grams,
      pieces,
    })),
  });
  return { document, entries };
}

async function postMovements(
  tx: Prisma.TransactionClient,
  document: StockDocument,
  movements: Movement[],
): Promise<StockLedgerEntry[]> {
  if (movements.length === 0) {
    return [];
  }
  const balances = await lockBalances(
    tx,
    movements.map(({ item, locationId }) => ({
      itemType: item.type,
      itemId: item.id,
      locationId,
    })),
  );

  const rows = movements.map(({ item, locationId, change, reversalOfId }) => {
    const key = keyOf({ itemType: item.type, itemId: item.id, locationId });
    const before = balances.get(key)!;
    const after = applyChange(before, item, change);
    if (isNegative(after)) {
      throw new ConflictException(`Not enough stock for ${item.code}`);
    }
    balances.set(key, after);
    return {
      documentId: document.id,
      itemType: item.type,
      itemId: item.id,
      locationId,
      movementType: document.kind,
      grams: after.grams - before.grams,
      pieces: item.type === 'PRODUCT' ? after.pieces - before.pieces : null,
      reversalOfId,
      postedById: document.postedById,
      postedAt: document.postedAt,
    };
  });

  const entries = await tx.stockLedgerEntry.createManyAndReturn({
    data: rows,
  });
  for (const row of rows) {
    const balance = balances.get(keyOf(row))!;
    await tx.stockBalance.update({
      where: {
        itemType_itemId_locationId: {
          itemType: row.itemType,
          itemId: row.itemId,
          locationId: row.locationId,
        },
      },
      data: { grams: BigInt(balance.grams), pieces: BigInt(balance.pieces) },
    });
  }
  return entries;
}

// Locks in one fixed order, so two documents touching the same balances
// (a transfer each way, say) wait for each other instead of deadlocking.
export async function lockBalances(
  tx: Prisma.TransactionClient,
  keys: BalanceKey[],
): Promise<Map<string, Balance>> {
  const unique = [
    ...new Map(
      keys.map(({ itemType, itemId, locationId }) => [
        keyOf({ itemType, itemId, locationId }),
        { itemType, itemId, locationId },
      ]),
    ).values(),
  ];
  unique.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));

  await tx.stockBalance.createMany({ data: unique, skipDuplicates: true });
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT item_type AS "itemType", item_id AS "itemId",
           location_id AS "locationId", grams, pieces
    FROM stock_balances
    WHERE (item_type, item_id, location_id) IN (${Prisma.join(
      unique.map(
        (key) =>
          Prisma.sql`(${key.itemType}::"StockItemType", ${key.itemId}::uuid, ${key.locationId}::uuid)`,
      ),
    )})
    ORDER BY item_type::text, item_id, location_id
    FOR UPDATE`;

  return new Map(
    rows.map((row) => [
      keyOf(row),
      { grams: grams(Number(row.grams)), pieces: toSafeNumber(row.pieces) },
    ]),
  );
}
