import { describe, expect, it } from 'vitest';
import { formatDay, formatMoment, formatMoney, formatWeight } from './format';

describe('format', () => {
  it('shows grams as kilograms with three decimals', () => {
    expect(formatWeight(1_250_500)).toBe('1250.500 kg');
    expect(formatWeight(25)).toBe('0.025 kg');
  });

  it('shows poisha as taka with lakh grouping', () => {
    expect(formatMoney(12_345_650)).toBe('৳1,23,456.50');
  });

  it('keeps a factory date on its own day', () => {
    expect(formatDay('2026-10-14')).toBe('14 Oct 2026');
  });

  it('shows a UTC timestamp in Bangladesh time, six hours ahead', () => {
    expect(formatMoment('2026-10-14T20:30:00.000Z')).toBe('15 Oct 2026, 02:30');
  });
});
