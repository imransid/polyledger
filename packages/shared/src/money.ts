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

const TAKA = new Intl.NumberFormat('en-IN');

// ৳1,23,456.50: amounts in Bangladesh group by lakh and crore.
export function formatPoisha(poisha: number): string {
  if (!Number.isSafeInteger(poisha)) {
    throw new RangeError(`Not a whole number of poisha: ${poisha}`);
  }
  const sign = poisha < 0 ? '-' : '';
  const absolute = Math.abs(poisha);
  const taka = TAKA.format(Math.floor(absolute / 100));
  const paisa = String(absolute % 100).padStart(2, '0');
  return `${sign}৳${taka}.${paisa}`;
}
