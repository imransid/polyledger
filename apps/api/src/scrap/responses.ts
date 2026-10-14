import { z } from 'zod';
import { StockItemType } from '../generated/prisma/client.js';

const whole = z.number().int();
const itemType = z.enum(StockItemType);

export const grindingBatchResponse = z.object({
  id: z.uuid(),
  stockDocumentId: z.uuid(),
  scrapLocationId: z.uuid(),
  storeLocationId: z.uuid(),
  inputItemType: itemType,
  inputItemId: z.uuid(),
  /** Products only. */
  inputPieces: whole.nullable(),
  inputGrams: whole,
  outputMaterialId: z.uuid(),
  outputGrams: whole,
  lossGrams: whole,
  groundOn: z.iso.date(),
  reversedAt: z.iso.datetime().nullable(),
  recordedById: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const grindingReportResponse = z.object({
  /** Batches that are not reversed. */
  totals: z.object({
    batches: whole,
    inputGrams: whole,
    outputGrams: whole,
    lossGrams: whole,
    /** Loss out of input: 2.35% is 235. */
    lossBasisPoints: whole.nullable(),
  }),
  batches: z.array(grindingBatchResponse),
});

export const scrapSaleResponse = z.object({
  id: z.uuid(),
  stockDocumentId: z.uuid(),
  buyerName: z.string(),
  soldOn: z.iso.date(),
  scrapLocationId: z.uuid(),
  reversedAt: z.iso.datetime().nullable(),
  recordedById: z.uuid(),
  createdAt: z.iso.datetime(),
  lines: z.array(
    z.object({
      saleId: z.uuid(),
      lineNo: whole,
      itemType,
      itemId: z.uuid(),
      /** Products only. */
      pieces: whole.nullable(),
      grams: whole,
      pricePerKgPoisha: whole,
      amountPoisha: whole,
    }),
  ),
  amountPoisha: whole,
});

export const scrapSalesReportResponse = z.object({
  /** Sales that are not reversed. */
  totals: z.object({ sales: whole, grams: whole, amountPoisha: whole }),
  sales: z.array(scrapSaleResponse),
});
