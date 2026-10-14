import type {
  StockDocument,
  StockDocumentKind,
} from '../../generated/prisma/client.js';

// These have their own record next to the ledger rows (a production entry,
// a sale with prices), which must be reversed together with them.
export const REVERSED_ELSEWHERE: Partial<Record<StockDocumentKind, string>> = {
  PRODUCTION: 'Production entries are reversed from their job card',
  WASTE: 'Waste entries are reversed from their job card',
  GRINDING: 'Grinding batches are reversed from scrap',
  SCRAP_SALE: 'Scrap sales are reversed from scrap',
  DISPATCH: 'Delivery challans are reversed from dispatch',
  CUSTOMER_RETURN: 'Customer returns are reversed from dispatch',
};

/** Whether the stock documents screen may offer to reverse it. */
export function isReversible(
  document: Pick<StockDocument, 'kind' | 'reversedAt'>,
): boolean {
  return (
    document.kind !== 'REVERSAL' &&
    document.reversedAt === null &&
    REVERSED_ELSEWHERE[document.kind] === undefined
  );
}
