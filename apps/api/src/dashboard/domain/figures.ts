import { addDays, fromDateString } from '../../common/dates.js';
import { basisPointsOf } from '../../common/quantities.js';

/** A challan waiting longer than this for its gate pass stands out. */
export const GATE_WAIT_LIMIT_MINUTES = 60;

/** Factory dates, from and to both included. */
export interface DayRange {
  from: string;
  to: string;
}

/** Today and the six days before it. */
export function lastSevenDays(today: string): DayRange {
  return { from: addDays(today, -6), to: today };
}

/** Today and the six days after it. */
export function nextSevenDays(today: string): DayRange {
  return { from: today, to: addDays(today, 6) };
}

export function daysOf({ from, to }: DayRange): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

export function daysLate(deliveryDate: string, today: string): number {
  const millis =
    fromDateString(today).getTime() - fromDateString(deliveryDate).getTime();
  return Math.round(millis / 86_400_000);
}

/** The difference as a signed share of what was issued: −1.25% is −125. */
export function shareOfIssued(
  differenceGrams: number,
  issuedGrams: number,
): number | null {
  const share = basisPointsOf(Math.abs(differenceGrams), issuedGrams);
  return share === null || differenceGrams >= 0 ? share : -share;
}

/** The biggest difference first, whichever way it goes. */
export function worstFirst(
  a: { differenceGrams: number },
  b: { differenceGrams: number },
): number {
  return Math.abs(b.differenceGrams) - Math.abs(a.differenceGrams);
}

export function minutesWaiting(since: Date, now: Date): number {
  return Math.floor((now.getTime() - since.getTime()) / 60_000);
}

export function waitedTooLong(minutes: number): boolean {
  return minutes > GATE_WAIT_LIMIT_MINUTES;
}
