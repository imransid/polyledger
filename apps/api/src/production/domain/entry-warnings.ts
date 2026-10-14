export interface CountedShift {
  shotStart: number;
  shotEnd: number;
  goodPieces: number;
  rejectedPieces: number;
}

// Warnings, never refusals: a blocked cavity or a counter reset on the
// machine are real events the supervisor should look at, not typing errors.
export function entryWarnings(
  entry: CountedShift,
  cavities: number,
  previousShotEnd: number | null,
): string[] {
  const warnings: string[] = [];
  const made = entry.goodPieces + entry.rejectedPieces;
  const expected = (entry.shotEnd - entry.shotStart) * cavities;
  if (made !== expected) {
    warnings.push(
      `Good + rejected is ${made} pieces, but shots x cavities is ${expected}`,
    );
  }
  if (previousShotEnd !== null && previousShotEnd !== entry.shotStart) {
    warnings.push(
      `Shot counter starts at ${entry.shotStart}, but the previous entry on this machine ended at ${previousShotEnd}`,
    );
  }
  return warnings;
}
