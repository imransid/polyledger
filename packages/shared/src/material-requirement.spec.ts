import { describe, expect, it } from 'vitest';
import { requiredMaterial } from './material-requirement.js';

describe('requiredMaterial', () => {
  it('adds waste on top of the net weight', () => {
    const requirement = requiredMaterial({
      pieces: 1_000,
      pieceWeightMg: 3_000,
      wasteBasisPoints: 500,
      lineBasisPoints: [10_000],
    });

    expect(requirement).toEqual({ total: 3_150, lines: [3_150] });
  });

  it('gives the leftover grams to the lines with the largest remainders', () => {
    // Exact shares: 3071.25 g resin, 63 g masterbatch, 15.75 g additive.
    const requirement = requiredMaterial({
      pieces: 1_000,
      pieceWeightMg: 3_000,
      wasteBasisPoints: 500,
      lineBasisPoints: [9_750, 200, 50],
    });

    expect(requirement).toEqual({ total: 3_150, lines: [3_071, 63, 16] });
  });

  it('breaks ties in favour of the earlier line', () => {
    const requirement = requiredMaterial({
      pieces: 1,
      pieceWeightMg: 1_000,
      wasteBasisPoints: 0,
      lineBasisPoints: [5_000, 5_000],
    });

    expect(requirement.lines).toEqual([1, 0]);
  });

  it.each([
    [500, 1],
    [499, 0],
    [1_500, 2],
  ])('rounds a total of %d mg half up to %d g', (pieceWeightMg, total) => {
    const requirement = requiredMaterial({
      pieces: 1,
      pieceWeightMg,
      wasteBasisPoints: 0,
      lineBasisPoints: [10_000],
    });

    expect(requirement.total).toBe(total);
  });

  it('needs nothing for zero pieces', () => {
    const requirement = requiredMaterial({
      pieces: 0,
      pieceWeightMg: 2_500,
      wasteBasisPoints: 350,
      lineBasisPoints: [9_800, 200],
    });

    expect(requirement).toEqual({ total: 0, lines: [0, 0] });
  });

  it('keeps every line within a gram of its exact share and adds up to the total', () => {
    const lineSets = [
      [3_333, 3_333, 3_334],
      [1, 9_999],
      [2_500, 2_500, 2_500, 2_500],
      [9_750, 200, 49, 1],
    ];

    for (const pieces of [1, 7, 333, 100_000, 9_999_999]) {
      for (const pieceWeightMg of [1, 2_499, 3_333, 125_000]) {
        for (const wasteBasisPoints of [0, 1, 350, 1_234]) {
          for (const lineBasisPoints of lineSets) {
            const { total, lines } = requiredMaterial({
              pieces,
              pieceWeightMg,
              wasteBasisPoints,
              lineBasisPoints,
            });

            expect(lines.reduce((sum, line) => sum + line, 0)).toBe(total);
            const exactTotal =
              (pieces * pieceWeightMg * (10_000 + wasteBasisPoints)) / 1e7;
            lineBasisPoints.forEach((basisPoints, index) => {
              const exactShare = (exactTotal * basisPoints) / 10_000;
              expect(Math.abs(lines[index] - exactShare)).toBeLessThan(1.5);
            });
          }
        }
      }
    }
  });

  it('stays exact where floating point would not', () => {
    const requirement = requiredMaterial({
      pieces: 9_000_000,
      pieceWeightMg: 999_999,
      wasteBasisPoints: 9_999,
      lineBasisPoints: [3_333, 3_333, 3_334],
    });

    // 9e6 x 999,999 mg x 1.9999 = 17,999,082,000.9 g. Exact line shares:
    // 5,999,094,030.89997 (twice) and 6,000,893,939.10006.
    expect(requirement.total).toBe(17_999_082_001);
    expect(requirement.lines).toEqual([
      5_999_094_031, 5_999_094_031, 6_000_893_939,
    ]);
  });

  it('refuses a total beyond the safe integer range', () => {
    expect(() =>
      requiredMaterial({
        pieces: Number.MAX_SAFE_INTEGER,
        pieceWeightMg: 1_000_000,
        wasteBasisPoints: 0,
        lineBasisPoints: [10_000],
      }),
    ).toThrow(RangeError);
  });

  it.each([
    [[9_000], 'Line percents must add up to exactly 100.00%'],
    [[10_000, 1], 'Line percents must add up to exactly 100.00%'],
    [[10_000, 0], 'Line percent must be a whole number of at least 1'],
    [[], 'A formula needs at least one line'],
  ])('rejects the lines %j', (lineBasisPoints, message) => {
    expect(() =>
      requiredMaterial({
        pieces: 1,
        pieceWeightMg: 1_000,
        wasteBasisPoints: 0,
        lineBasisPoints,
      }),
    ).toThrow(message);
  });

  it('rejects fractional pieces', () => {
    expect(() =>
      requiredMaterial({
        pieces: 1.5,
        pieceWeightMg: 1_000,
        wasteBasisPoints: 0,
        lineBasisPoints: [10_000],
      }),
    ).toThrow('Pieces must be a whole number of at least 0');
  });
});
