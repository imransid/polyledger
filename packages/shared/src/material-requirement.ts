import { grams, type Grams } from './grams.js';

export const WHOLE_IN_BASIS_POINTS = 10_000;

const MILLIGRAMS_PER_GRAM = 1_000;

export interface MaterialRequirementInput {
  pieces: number;
  pieceWeightMg: number;
  wasteBasisPoints: number;
  lineBasisPoints: readonly number[];
}

export interface MaterialRequirement {
  total: Grams;
  lines: Grams[];
}

// pieces x piece weight x (1 + waste) x line percent, in whole grams.
// The total rounds half up; the lines share it out by largest remainder so
// they always add up to exactly the total. Ties go to the earlier line.
// Done in bigint because the products overflow Number long before the
// result does.
export function requiredMaterial({
  pieces,
  pieceWeightMg,
  wasteBasisPoints,
  lineBasisPoints,
}: MaterialRequirementInput): MaterialRequirement {
  assertWholeNumber(pieces, 'Pieces', 0);
  assertWholeNumber(pieceWeightMg, 'Piece weight', 1);
  assertWholeNumber(wasteBasisPoints, 'Waste', 0);
  assertLines(lineBasisPoints);

  const whole = BigInt(WHOLE_IN_BASIS_POINTS);
  const totalScale = whole * BigInt(MILLIGRAMS_PER_GRAM);
  const lineScale = totalScale * whole;

  const scaledTotal =
    BigInt(pieces) * BigInt(pieceWeightMg) * (whole + BigInt(wasteBasisPoints));
  const total = (scaledTotal * 2n + totalScale) / (totalScale * 2n);

  const shares = lineBasisPoints.map(
    (basisPoints) => scaledTotal * BigInt(basisPoints),
  );
  const lines = shares.map((share) => share / lineScale);

  const missing = total - lines.reduce((sum, line) => sum + line, 0n);
  const byRemainder = shares
    .map((share, index) => ({ index, remainder: share % lineScale }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const { index } of byRemainder.slice(0, Number(missing))) {
    lines[index] += 1n;
  }

  return {
    total: grams(Number(total)),
    lines: lines.map((line) => grams(Number(line))),
  };
}

// What `pieces` finished pieces weigh, rounded half up to whole grams.
export function gramsForPieces(pieces: number, pieceWeightMg: number): Grams {
  assertWholeNumber(pieces, 'Pieces', 0);
  assertWholeNumber(pieceWeightMg, 'Piece weight', 1);
  const milligrams = BigInt(pieces) * BigInt(pieceWeightMg);
  const milligramsPerGram = BigInt(MILLIGRAMS_PER_GRAM);
  return grams(
    Number((milligrams * 2n + milligramsPerGram) / (milligramsPerGram * 2n)),
  );
}

function assertWholeNumber(value: number, label: string, minimum: number) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(
      `${label} must be a whole number of at least ${minimum}`,
    );
  }
}

function assertLines(lineBasisPoints: readonly number[]) {
  if (lineBasisPoints.length === 0) {
    throw new RangeError('A formula needs at least one line');
  }
  for (const basisPoints of lineBasisPoints) {
    assertWholeNumber(basisPoints, 'Line percent', 1);
  }
  const sum = lineBasisPoints.reduce((total, line) => total + line, 0);
  if (sum !== WHOLE_IN_BASIS_POINTS) {
    throw new RangeError('Line percents must add up to exactly 100.00%');
  }
}
