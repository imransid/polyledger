import { z } from 'zod';
import { timestamps } from '../common/master-data.js';
import {
  LocationKind,
  StockDocumentKind,
  StockItemType,
} from '../generated/prisma/client.js';

const whole = z.number().int();
const kind = z.enum(StockDocumentKind);
const itemType = z.enum(StockItemType);

export const locationResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.enum(LocationKind),
  isActive: z.boolean(),
  ...timestamps,
});

const stockDocument = z.object({
  id: z.uuid(),
  number: z.string(),
  kind,
  supplierId: z.uuid().nullable(),
  supplierReference: z.string().nullable(),
  /** A calendar day, sent as its UTC midnight. */
  receivedOn: z.iso.datetime().nullable(),
  reason: z.string().nullable(),
  reversesId: z.uuid().nullable(),
  reversedAt: z.iso.datetime().nullable(),
  jobCardId: z.uuid().nullable(),
  postedById: z.uuid(),
  postedAt: z.iso.datetime(),
});

/** What a posting answers with: the document and its ledger rows. */
export const postedDocumentResponse = stockDocument.extend({
  entries: z.array(
    z.object({
      id: whole,
      documentId: z.uuid(),
      itemType,
      itemId: z.uuid(),
      locationId: z.uuid(),
      movementType: kind,
      grams: whole,
      pieces: whole.nullable(),
      reversalOfId: whole.nullable(),
      postedById: z.uuid(),
      postedAt: z.iso.datetime(),
    }),
  ),
  receiptLines: z.array(
    z.object({
      documentId: z.uuid(),
      rawMaterialId: z.uuid(),
      challanGrams: whole,
      receivedGrams: whole,
    }),
  ),
});

const described = {
  postedByName: z.string(),
  /** False for reversals, reversed documents and kinds reversed elsewhere. */
  reversible: z.boolean(),
};

export const documentSummaryResponse = stockDocument.extend(described);

export const documentDetailResponse = postedDocumentResponse.extend(described);

export const balanceResponse = z.object({
  itemType,
  itemId: z.uuid(),
  itemCode: z.string(),
  locationId: z.uuid(),
  grams: whole,
  pieces: whole.nullable(),
});

export const stockCardLineResponse = z.object({
  entryId: whole,
  postedAt: z.iso.datetime(),
  movementType: kind,
  documentId: z.uuid(),
  documentNumber: z.string(),
  locationId: z.uuid(),
  grams: whole,
  pieces: whole.nullable(),
  balanceGrams: whole,
  balancePieces: whole.nullable(),
});

export const lowStockResponse = z.array(
  z.object({
    rawMaterialId: z.uuid(),
    code: z.string(),
    name: z.string(),
    minimumStockGrams: whole,
    stockGrams: whole,
    shortByGrams: whole,
  }),
);

export const shortagesResponse = z.object({
  items: z.array(
    z.object({
      documentId: z.uuid(),
      documentNumber: z.string(),
      receivedOn: z.iso.date(),
      supplierId: z.uuid(),
      supplierReference: z.string(),
      rawMaterialId: z.uuid(),
      challanGrams: whole,
      receivedGrams: whole,
      shortGrams: whole,
    }),
  ),
  totalShortGrams: whole,
});
