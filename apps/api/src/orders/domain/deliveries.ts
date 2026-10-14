import { WHOLE_IN_BASIS_POINTS } from '@polyledger/shared';

/** Signed: a challan adds delivered pieces; its reversal takes them away. */
export interface DeliveryChange {
  productId: string;
  deliveredPieces: number;
  returnedPieces: number;
}

// The most a line may have delivered: its pieces plus the order's
// over-delivery tolerance, rounded down to whole pieces.
export function deliveryLimit(
  pieces: number,
  overDeliveryBasisPoints: number,
): number {
  return Math.floor(
    (pieces * (WHOLE_IN_BASIS_POINTS + overDeliveryBasisPoints)) /
      WHOLE_IN_BASIS_POINTS,
  );
}

export function isFullyDelivered(
  lines: { pieces: number; deliveredPieces: number }[],
): boolean {
  return lines.every((line) => line.deliveredPieces >= line.pieces);
}
