import { describe, expect, it } from 'vitest';
import { formatDecimal, parseDecimal } from './decimal';

describe('parseDecimal', () => {
  it.each([
    ['2.5', 3, 2_500],
    ['18', 3, 18_000],
    ['0.001', 3, 1],
    [' 8.5 ', 1, 85],
    ['97.25', 2, 9_725],
  ])('reads %s at %d places as %d', (text, places, value) => {
    expect(parseDecimal(text, places)).toBe(value);
  });

  it.each(['', 'abc', '-1', '1.2345', '1,5', '.5'])('refuses "%s"', (text) => {
    expect(parseDecimal(text, 3)).toBeNull();
  });
});

describe('formatDecimal', () => {
  it('drops trailing zeros unless asked to keep them', () => {
    expect(formatDecimal(2_500, 3)).toBe('2.5');
    expect(formatDecimal(18_000, 3)).toBe('18');
    expect(formatDecimal(5, 3)).toBe('0.005');
    expect(formatDecimal(9_750, 2, { keepZeros: true })).toBe('97.50');
  });
});
