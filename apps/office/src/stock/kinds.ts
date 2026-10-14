import type { StockDocumentKind } from '@/api/types';

export const DOCUMENT_KINDS: StockDocumentKind[] = [
  'RECEIPT',
  'TRANSFER',
  'ADJUSTMENT',
  'OPENING',
  'REVERSAL',
  'ISSUE',
  'PRODUCTION',
  'HANDOVER',
  'RETURN',
  'WASTE',
  'GRINDING',
  'SCRAP_SALE',
  'SCRAP_TRANSFER',
  'DISPATCH',
  'CUSTOMER_RETURN',
];

export function kindParam(value: string): StockDocumentKind | undefined {
  return DOCUMENT_KINDS.find((kind) => kind === value);
}
