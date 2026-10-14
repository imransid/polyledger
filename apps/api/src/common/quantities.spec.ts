import { describe, expect, it } from 'vitest';
import { basisPointsOf } from './quantities.js';

describe('basisPointsOf', () => {
  it.each([
    [1_600, 4_120, 3_883],
    [300, 10_000, 300],
    [1, 20_000, 1],
    [1, 20_001, 0],
    [0, 500, 0],
  ])('%d of %d is %d basis points', (part, whole, basisPoints) => {
    expect(basisPointsOf(part, whole)).toBe(basisPoints);
  });

  it('is null when there is nothing to compare against', () => {
    expect(basisPointsOf(50, 0)).toBeNull();
  });
});
