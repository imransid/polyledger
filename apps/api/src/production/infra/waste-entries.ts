import { toDateString } from '../../common/dates.js';
import type {
  WasteEntry,
  WasteEntryLine,
} from '../../generated/prisma/client.js';

export type WasteEntryView = Omit<WasteEntry, 'shiftDate'> & {
  shiftDate: string;
  lines: WasteEntryLine[];
};

export function toWasteEntryView(
  entry: WasteEntry & { lines: WasteEntryLine[] },
): WasteEntryView {
  return { ...entry, shiftDate: toDateString(entry.shiftDate) };
}
