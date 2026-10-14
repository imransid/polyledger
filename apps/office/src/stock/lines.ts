import { z } from 'zod';
import type { Location, StockItemType } from '@/api/types';
import { text } from '@/i18n';
import { parseDecimal } from '@/lib/decimal';
import { formatWeight } from '@/lib/format';

export interface ItemRef {
  itemType: StockItemType;
  itemId: string;
}

// An item select carries both halves in one value: "PRODUCT:<id>".
export function itemValue({ itemType, itemId }: ItemRef): string {
  return `${itemType}:${itemId}`;
}

export function parseItemValue(value: string): ItemRef | null {
  const [itemType, itemId] = value.split(':');
  if ((itemType === 'RAW_MATERIAL' || itemType === 'PRODUCT') && itemId) {
    return { itemType, itemId };
  }
  return null;
}

/** Grams for a material typed in kg, pieces for a product. */
export function parseAmount(
  itemType: StockItemType,
  quantity: string,
): number | null {
  if (itemType === 'RAW_MATERIAL') {
    return parseDecimal(quantity, 3);
  }
  return /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : null;
}

/** The line the API takes: kilograms as text, so no float on the way. */
export function apiLine(item: ItemRef, quantity: string) {
  return item.itemType === 'PRODUCT'
    ? {
        itemType: 'PRODUCT' as const,
        itemId: item.itemId,
        pieces: Number(quantity.trim()),
      }
    : {
        itemType: 'RAW_MATERIAL' as const,
        itemId: item.itemId,
        kilograms: quantity.trim(),
      };
}

export const emptyLine = { item: '', quantity: '' };

export const stockLine = z
  .object({ item: z.string(), quantity: z.string() })
  .superRefine((line, ctx) => {
    const item = parseItemValue(line.item);
    if (!item) {
      ctx.issues.push({
        code: 'custom',
        message: text.required,
        path: ['item'],
        input: line.item,
      });
    } else if (parseAmount(item.itemType, line.quantity) === null) {
      ctx.issues.push({
        code: 'custom',
        message:
          item.itemType === 'PRODUCT'
            ? text.valid.wholeNumber
            : text.valid.kilograms,
        path: ['quantity'],
        input: line.quantity,
      });
    }
  });

export const stockLines = z
  .array(stockLine)
  .min(1, text.stock.noLines)
  .refine(
    (lines) => new Set(lines.map((line) => line.item)).size === lines.length,
    text.stock.sameItemTwice,
  );

/** Challan minus received, once both are readable. */
export function shortage(challan: string, received: string): string {
  const billed = parseDecimal(challan, 3);
  const weighed = parseDecimal(received, 3);
  if (billed === null || weighed === null) {
    return '';
  }
  if (billed === weighed) {
    return text.stock.receive.exact;
  }
  return billed > weighed
    ? text.stock.receive.short(formatWeight(billed - weighed))
    : text.stock.receive.over(formatWeight(weighed - billed));
}

export function locationOptions(locations: Location[]) {
  return [
    { value: '', label: text.stock.chooseLocation },
    ...locations.map((location) => ({
      value: location.id,
      label: `${location.code} · ${location.name}`,
    })),
  ];
}
