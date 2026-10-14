import { describe, expect, it } from 'vitest';
import { poishaForGrams } from './money.js';

describe('poishaForGrams', () => {
  it.each([
    // 2.345 kg at 45.50 BDT/kg = 106.6975 BDT
    [2_345, 4_550, 10_670],
    [250, 2_000, 500],
    [1, 500, 1],
    [1, 499, 0],
    [0, 4_550, 0],
  ])('%d g at %d poisha/kg is %d poisha', (grams, price, poisha) => {
    expect(poishaForGrams(grams, price)).toBe(poisha);
  });

  it('stays exact when grams x price is beyond the safe integer range', () => {
    expect(poishaForGrams(9_007_199_254, 999_999)).toBe(9_007_190_246_801);
  });

  it.each([
    [-1, 100],
    [1.5, 100],
    [100, -1],
  ])('rejects %d g at %d poisha/kg', (grams, price) => {
    expect(() => poishaForGrams(grams, price)).toThrow(RangeError);
  });
});
