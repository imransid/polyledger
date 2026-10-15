import { describe, expect, it } from '@jest/globals';
import { formatCount, formatMoment } from './format';

describe('format', () => {
  it('groups counts by lakh and crore', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(120_000)).toBe('1,20,000');
    expect(formatCount(12_345_678)).toBe('1,23,45,678');
  });

  it('shows moments in Bangladesh time', () => {
    expect(formatMoment(Date.UTC(2026, 9, 15, 20, 30))).toBe(
      '16/10/2026, 02:30',
    );
  });
});
