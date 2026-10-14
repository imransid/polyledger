import { describe, expect, it } from 'vitest';
import {
  daysLate,
  daysOf,
  lastSevenDays,
  minutesWaiting,
  nextSevenDays,
  shareOfIssued,
  waitedTooLong,
  worstFirst,
} from './figures.js';

describe('date ranges', () => {
  it('counts today as the first and the last of seven days', () => {
    expect(lastSevenDays('2026-10-15')).toEqual({
      from: '2026-10-09',
      to: '2026-10-15',
    });
    expect(nextSevenDays('2026-10-29')).toEqual({
      from: '2026-10-29',
      to: '2026-11-04',
    });
    expect(daysOf(lastSevenDays('2026-03-02'))).toEqual([
      '2026-02-24',
      '2026-02-25',
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('counts an order as one day late the day after its delivery date', () => {
    expect(daysLate('2026-10-14', '2026-10-15')).toBe(1);
    expect(daysLate('2026-09-30', '2026-10-15')).toBe(15);
  });
});

describe('material difference', () => {
  it('is a signed share of what was issued, rounded half up', () => {
    // 1.5 kg missing of 120 kg issued is 1.25%.
    expect(shareOfIssued(1_500, 120_000)).toBe(125);
    expect(shareOfIssued(-1_500, 120_000)).toBe(-125);
    // 1 g of 8 kg is 0.0125%, which rounds up to 0.01%.
    expect(shareOfIssued(-1, 8_000)).toBe(-1);
    expect(shareOfIssued(-200, 0)).toBeNull();
  });

  it('puts the biggest difference first, either way', () => {
    const cards = [
      { number: 'JC-1', differenceGrams: 900 },
      { number: 'JC-2', differenceGrams: -2_500 },
      { number: 'JC-3', differenceGrams: 1_200 },
    ];

    expect(cards.sort(worstFirst).map((card) => card.number)).toEqual([
      'JC-2',
      'JC-3',
      'JC-1',
    ]);
  });
});

describe('gate wait', () => {
  it('stands out after more than an hour', () => {
    const posted = new Date('2026-10-15T04:00:00Z');

    expect(minutesWaiting(posted, new Date('2026-10-15T05:00:59Z'))).toBe(60);
    expect(waitedTooLong(60)).toBe(false);
    expect(minutesWaiting(posted, new Date('2026-10-15T05:01:00Z'))).toBe(61);
    expect(waitedTooLong(61)).toBe(true);
  });
});
