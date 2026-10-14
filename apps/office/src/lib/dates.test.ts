import { describe, expect, it } from 'vitest';
import { addDays, factoryToday } from './dates';

describe('factory dates', () => {
  it('is already the next day in Dhaka at 20:30 UTC', () => {
    expect(factoryToday(new Date('2026-10-14T20:30:00Z'))).toBe('2026-10-15');
    expect(factoryToday(new Date('2026-10-14T17:59:00Z'))).toBe('2026-10-14');
  });

  it('counts days across a month end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-01', -30)).toBe('2026-09-01');
  });
});
