import { describe, expect, it } from 'vitest';
import { lateRecordProblem } from './sessions.js';

const hours = (count: number) =>
  new Date(Date.UTC(2026, 9, 15) + count * 3_600_000);
// Signed in at 0:00 for twelve hours.
const session = { startedAt: hours(0), expiresAt: hours(12) };

describe('lateRecordProblem', () => {
  it('takes anything while the sign-in lasts, whatever the tablet clock says', () => {
    expect(lateRecordProblem(session, hours(-30), hours(11))).toBeNull();
  });

  it('takes a late record made during the sign-in and sent within 72 hours', () => {
    expect(lateRecordProblem(session, hours(11), hours(83))).toBeNull();
  });

  it('refuses a late record made outside the sign-in', () => {
    expect(lateRecordProblem(session, hours(13), hours(14))).toBe(
      'Recorded outside the sign-in it names',
    );
    expect(lateRecordProblem(session, hours(-1), hours(14))).toBe(
      'Recorded outside the sign-in it names',
    );
  });

  it('refuses a late record sent more than 72 hours after it was made', () => {
    expect(lateRecordProblem(session, hours(11), hours(83.01))).toBe(
      'Arrived more than 72 hours after it was recorded',
    );
  });
});
