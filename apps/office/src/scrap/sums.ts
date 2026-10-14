import { gramsForPieces, poishaForGrams } from '@polyledger/shared';
import type { StockItemType } from '@/api/types';
import { parseDecimal } from '@/lib/decimal';
import { parseAmount } from '@/stock/lines';

export interface SaleFigures {
  grams: number;
  amountPoisha: number;
}

// A figure too large for a whole number is no figure at all: the screen
// shows nothing for it, and the API refuses it.
function figure(work: () => number): number | null {
  try {
    return work();
  } catch (error) {
    if (error instanceof RangeError) {
      return null;
    }
    throw error;
  }
}

/** Kilograms typed for a material; pieces x piece weight for a product. */
export function lineGrams(
  itemType: StockItemType,
  quantity: string,
  pieceWeightMg: number | undefined,
): number | null {
  const amount = parseAmount(itemType, quantity);
  if (amount === null || itemType === 'RAW_MATERIAL') {
    return amount;
  }
  if (pieceWeightMg === undefined) {
    return null;
  }
  return figure(() => gramsForPieces(amount, pieceWeightMg));
}

/** Loss out of input: 3.05% is 305, rounded half up as the API reports it. */
export function grindingLoss(inputGrams: number, outputGrams: number) {
  const lossGrams = inputGrams - outputGrams;
  return {
    lossGrams,
    lossBasisPoints:
      inputGrams === 0
        ? null
        : Math.floor((lossGrams * 20_000 + inputGrams) / (inputGrams * 2)),
  };
}

/** A sale line's weight and amount, once its weight and price read. */
export function saleLine(
  grams: number | null,
  price: string,
): SaleFigures | null {
  const pricePerKgPoisha = parseDecimal(price, 2);
  if (grams === null || pricePerKgPoisha === null) {
    return null;
  }
  const amountPoisha = figure(() => poishaForGrams(grams, pricePerKgPoisha));
  return amountPoisha === null ? null : { grams, amountPoisha };
}

/** The lines that read so far, added up. */
export function saleTotals(lines: (SaleFigures | null)[]): SaleFigures {
  return lines.reduce<SaleFigures>(
    (total, line) =>
      line
        ? {
            grams: total.grams + line.grams,
            amountPoisha: total.amountPoisha + line.amountPoisha,
          }
        : total,
    { grams: 0, amountPoisha: 0 },
  );
}
