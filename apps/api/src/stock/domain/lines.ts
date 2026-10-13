import { z } from 'zod';
import { kilogramsSchema, piecesSchema } from '../../common/quantities.js';

const rawMaterialLine = z.object({
  itemType: z.literal('RAW_MATERIAL'),
  itemId: z.uuid(),
  kilograms: kilogramsSchema,
});

const productLine = z.object({
  itemType: z.literal('PRODUCT'),
  itemId: z.uuid(),
  pieces: piecesSchema,
});

// Each line comes out as a quantity in the item's own unit: grams for raw
// materials, pieces for products.
export const stockLinesSchema = z
  .array(z.discriminatedUnion('itemType', [rawMaterialLine, productLine]))
  .min(1)
  .refine(
    (lines) =>
      new Set(lines.map((line) => `${line.itemType}:${line.itemId}`)).size ===
      lines.length,
    'Each item can appear only once',
  )
  .transform((lines) =>
    lines.map((line) => ({
      itemType: line.itemType,
      itemId: line.itemId,
      quantity: line.itemType === 'RAW_MATERIAL' ? line.kilograms : line.pieces,
    })),
  );

export type StockLine = z.output<typeof stockLinesSchema>[number];
