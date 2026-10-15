// Latin digits in both languages: the floor reads them off shot counters
// and scales, and copies them into the tablet.
const COUNT = new Intl.NumberFormat('en-IN');

const MOMENT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Dhaka',
});

/** Grouped by lakh and crore: 1,20,000. */
export function formatCount(value: number): string {
  return COUNT.format(value);
}

/** Milliseconds since 1970 in Bangladesh time: "15/10/2026, 14:30". */
export function formatMoment(milliseconds: number): string {
  return MOMENT.format(new Date(milliseconds));
}
