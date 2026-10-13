import { describe, expect, it } from 'vitest';
import {
  formatKilograms,
  grams,
  isGrams,
  parseKilograms,
  sumGrams,
} from './grams.js';

describe('grams', () => {
  it.each([0, 1, 25_000, -25_000, Number.MAX_SAFE_INTEGER])(
    'accepts %d',
    (value) => {
      expect(grams(value)).toBe(value);
    },
  );

  it.each([0.5, -1.25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %d',
    (value) => {
      expect(() => grams(value)).toThrow(RangeError);
    },
  );

  it('narrows unknown values', () => {
    expect(isGrams(1500)).toBe(true);
    expect(isGrams('1500')).toBe(false);
  });
});

describe('sumGrams', () => {
  it('adds signed amounts', () => {
    expect(sumGrams([grams(25_000), grams(-1_250), grams(300)])).toBe(24_050);
  });

  it('returns zero for no amounts', () => {
    expect(sumGrams([])).toBe(0);
  });

  it('rejects a total beyond the safe integer range', () => {
    expect(() => sumGrams([grams(Number.MAX_SAFE_INTEGER), grams(1)])).toThrow(
      RangeError,
    );
  });
});

describe('parseKilograms', () => {
  it.each([
    ['25', 25_000],
    ['25.5', 25_500],
    ['12.345', 12_345],
    ['0.001', 1],
    ['1.005', 1_005],
    [' 7.25 ', 7_250],
  ])('parses "%s" as %d g', (input, expected) => {
    expect(parseKilograms(input)).toBe(expected);
  });

  it.each(['12.3456', '-1', '1,5', '.5', '12.', '', 'abc', '1e3'])(
    'rejects "%s"',
    (input) => {
      expect(() => parseKilograms(input)).toThrow(RangeError);
    },
  );
});

describe('formatKilograms', () => {
  it.each([
    [12_345, '12.345'],
    [25_000, '25.000'],
    [5, '0.005'],
    [0, '0.000'],
    [-1_500, '-1.500'],
  ])('formats %d g as "%s"', (value, expected) => {
    expect(formatKilograms(grams(value))).toBe(expected);
  });

  it('round-trips with parseKilograms', () => {
    expect(parseKilograms(formatKilograms(grams(98_765)))).toBe(98_765);
  });
});
