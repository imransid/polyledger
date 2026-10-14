import {
  formatKilograms,
  formatPoisha,
  grams,
  toLocalPhone,
} from '@polyledger/shared';
import { formatDecimal } from './decimal';

const FACTORY_TIME_ZONE = 'Asia/Dhaka';

const PIECES = new Intl.NumberFormat('en-IN');

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

/** A piece or runner weight in milligrams, in grams: "2.5 g". */
export function formatGrams(milligrams: number): string {
  return `${formatDecimal(milligrams, 3)} g`;
}

/** Tenths of a second: "8.5 s". */
export function formatSeconds(tenths: number): string {
  return `${formatDecimal(tenths, 1, { keepZeros: true })} s`;
}

/** Basis points: "97.50%". */
export function formatPercent(basisPoints: number): string {
  return `${formatDecimal(basisPoints, 2, { keepZeros: true })}%`;
}

/** Stored as +8801712345678, shown as people write it: 01712345678. */
export const formatPhone = toLocalPhone;

/** Whole pieces with lakh grouping: "1,20,000 pcs". */
export function formatPieces(pieces: number): string {
  return `${PIECES.format(pieces)} pcs`;
}

/** A stock quantity in the item's own unit: kg for materials, pieces for products. */
export function formatQuantity(
  itemType: 'RAW_MATERIAL' | 'PRODUCT',
  amount: number,
): string {
  return itemType === 'PRODUCT' ? formatPieces(amount) : formatWeight(amount);
}

/** A movement: "+12.500 kg", "−300 pcs". */
export function formatChange(
  itemType: 'RAW_MATERIAL' | 'PRODUCT',
  amount: number,
): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${formatQuantity(itemType, Math.abs(amount))}`;
}

/** Seconds as "14 h 10 min", or "45 min" under an hour. */
export function formatDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
}
