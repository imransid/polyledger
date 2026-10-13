import { gramsForPieces } from '@polyledger/shared';

export type StockItem =
  | { type: 'RAW_MATERIAL'; id: string; code: string; isActive: boolean }
  | {
      type: 'PRODUCT';
      id: string;
      code: string;
      isActive: boolean;
      pieceWeightMg: number;
    };

export interface Balance {
  grams: number;
  pieces: number;
}

// Raw materials move in grams, products in pieces. `by` moves stock;
// `to` sets it to a counted quantity.
export type Change = { by: number } | { to: number };

export function applyChange(
  before: Balance,
  item: StockItem,
  change: Change,
): Balance {
  if (item.type === 'RAW_MATERIAL') {
    const grams = 'to' in change ? change.to : before.grams + change.by;
    return { grams, pieces: 0 };
  }

  const pieces = 'to' in change ? change.to : before.pieces + change.by;
  if (pieces < 0) {
    return { grams: before.grams, pieces };
  }
  // Product grams always follow the pieces, so rounding a 2.5 g piece to
  // whole grams can never pile up or push the gram balance below zero.
  return { pieces, grams: gramsForPieces(pieces, item.pieceWeightMg) };
}

export function isNegative(balance: Balance): boolean {
  return balance.grams < 0 || balance.pieces < 0;
}
