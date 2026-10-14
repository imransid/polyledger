import { describe, expect, it } from 'vitest';
import {
  formatCartons,
  formatChange,
  formatDuration,
  formatDay,
  formatDayOfMonth,
  formatGrams,
  formatMoment,
  formatMoney,
  formatPercent,
  formatPercentChange,
  formatPhone,
  formatPieces,
  formatSeconds,
  formatWeight,
} from './format';

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

  it('shows master data units the way the factory writes them', () => {
    expect(formatGrams(2_500)).toBe('2.5 g');
    expect(formatSeconds(85)).toBe('8.5 s');
    expect(formatSeconds(120)).toBe('12.0 s');
    expect(formatPercent(9_750)).toBe('97.50%');
    expect(formatPhone('+8801712345678')).toBe('01712345678');
  });

  it('shows stock in its own unit, with a sign for movements', () => {
    expect(formatPieces(120_000)).toBe('1,20,000 pcs');
    expect(formatChange('RAW_MATERIAL', 12_500)).toBe('+12.500 kg');
    expect(formatChange('PRODUCT', -300)).toBe('−300 pcs');
  });

  it('signs a percentage change and shortens a chart date', () => {
    expect(formatPercentChange(125)).toBe('+1.25%');
    expect(formatPercentChange(-40)).toBe('−0.40%');
    expect(formatPercentChange(0)).toBe('0.00%');
    expect(formatDayOfMonth('2026-10-09')).toBe('9 Oct');
  });

  it('counts whole cartons and the loose pieces left over', () => {
    expect(formatCartons(24_040, 2_000)).toBe('12 ctn + 40 pcs');
    expect(formatCartons(24_000, 2_000)).toBe('12 ctn');
    expect(formatCartons(1_999, 2_000)).toBe('1,999 pcs');
    expect(formatCartons(200_000, 100)).toBe('2,000 ctn');
  });

  it('shows a run time in hours and minutes, rounding up', () => {
    expect(formatDuration(51_000)).toBe('14 h 10 min');
    expect(formatDuration(2_699)).toBe('45 min');
    expect(formatDuration(3_600)).toBe('1 h 0 min');
  });
});
