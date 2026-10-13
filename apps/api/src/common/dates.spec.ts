import { describe, expect, it } from 'vitest';
import { factoryToday, fromDateString, toDateString } from './dates.js';

describe('factoryToday', () => {
  it.each([
    ['2026-10-13T17:59:59Z', '2026-10-13'],
    ['2026-10-13T18:00:00Z', '2026-10-14'],
    ['2026-10-14T05:00:00Z', '2026-10-14'],
  ])('at %s it is %s in Bangladesh', (instant, date) => {
    expect(factoryToday(new Date(instant))).toBe(date);
  });
});

it('round-trips a calendar date', () => {
  expect(toDateString(fromDateString('2026-02-28'))).toBe('2026-02-28');
});
