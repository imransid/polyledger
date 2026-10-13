// Times are stored in UTC, but "today" is the factory's date in Bangladesh:
// between midnight and 6 am there, the UTC date is still yesterday.
const FACTORY_TIME_ZONE = 'Asia/Dhaka';

export function factoryToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FACTORY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Postgres DATE columns come back as UTC midnight.
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromDateString(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
