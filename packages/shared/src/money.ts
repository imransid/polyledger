// Amounts are integer poisha (BDT x 100), like weights are integer grams.

// Weight x price per kg, rounded half up to whole poisha.
export function poishaForGrams(
  grams: number,
  pricePerKgPoisha: number,
): number {
  for (const value of [grams, pricePerKgPoisha]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(
        'Grams and price must be whole numbers of at least 0',
      );
    }
  }
  const scaled = BigInt(grams) * BigInt(pricePerKgPoisha);
  const poisha = Number((scaled * 2n + 1_000n) / 2_000n);
  if (!Number.isSafeInteger(poisha)) {
    throw new RangeError('Amount is beyond the safe integer range');
  }
  return poisha;
}
