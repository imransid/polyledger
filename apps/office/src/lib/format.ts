import { formatKilograms, formatPoisha, grams } from '@polyledger/shared';

const FACTORY_TIME_ZONE = 'Asia/Dhaka';

// Factory dates (order dates, shift dates) are calendar days without a time,
// so they must not shift with any time zone.
const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

// Timestamps are stored in UTC and read in Bangladesh time.
const MOMENT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: FACTORY_TIME_ZONE,
});

/** Integer grams as kilograms with three decimals: "1250.500 kg". */
export function formatWeight(value: number): string {
  return `${formatKilograms(grams(value))} kg`;
}

/** Integer poisha as taka: "৳1,23,456.50". */
export const formatMoney = formatPoisha;

/** A factory date such as "2026-10-14": "14 Oct 2026". */
export function formatDay(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`));
}

/** A UTC timestamp in Bangladesh time: "15 Oct 2026, 02:30". */
export function formatMoment(timestamp: string): string {
  return MOMENT.format(new Date(timestamp));
}
