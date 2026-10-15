import { z } from 'zod';
import type { Rejection, Shift, WasteType } from '@/api/types';
import { formatDecimal } from '@/lib/decimal';

export interface EntryPrefill {
  shiftDate: string;
  shift: Shift;
  operatorId: string;
  shotStart: string;
  shotEnd: string;
  goodPieces: string;
  rejectedPieces: string;
}

export interface WastePrefill {
  shiftDate: string;
  shift: Shift;
  wasteMaterialId: string;
  scrapLocationId: string;
  kilograms: Record<WasteType, string>;
}

/** Router state for the shifts tab: the office form, filled in. */
export type Prefill = { entry: EntryPrefill } | { waste: WastePrefill };

const shift = z.enum(['A', 'B', 'C']);
const whole = z.number().int().min(0);

const tabletEntry = z.object({
  shift_date: z.iso.date(),
  shift,
  operator_id: z.string(),
  shot_start: whole,
  shot_end: whole,
  good_pieces: whole,
  rejected_pieces: whole,
});

const tabletWaste = z.object({
  shift_date: z.iso.date(),
  shift,
  waste_material_id: z.string(),
  scrap_location_id: z.string(),
  runner_grams: whole,
  reject_grams: whole,
  purge_grams: whole,
  sweepings_grams: whole,
});

// The form takes kilograms; nothing weighed stays blank.
const kilograms = (grams: number) => (grams > 0 ? formatDecimal(grams, 3) : '');

export type TabletRecord =
  | { kind: 'PRODUCTION_ENTRY'; entry: z.infer<typeof tabletEntry> }
  | { kind: 'WASTE_ENTRY'; waste: z.infer<typeof tabletWaste> };

/** A refused record as the tablet sent it, when it reads. */
export function tabletRecord(rejection: Rejection): TabletRecord | null {
  if (rejection.kind === 'PRODUCTION_ENTRY') {
    const entry = tabletEntry.safeParse(rejection.payload);
    return entry.success
      ? { kind: 'PRODUCTION_ENTRY', entry: entry.data }
      : null;
  }
  const waste = tabletWaste.safeParse(rejection.payload);
  return waste.success ? { kind: 'WASTE_ENTRY', waste: waste.data } : null;
}

/** The office form's values from a refused tablet record, when it reads. */
export function prefillFrom(rejection: Rejection): Prefill | null {
  const record = tabletRecord(rejection);
  if (!record) {
    return null;
  }
  if (record.kind === 'PRODUCTION_ENTRY') {
    const { entry } = record;
    return {
      entry: {
        shiftDate: entry.shift_date,
        shift: entry.shift,
        operatorId: entry.operator_id,
        shotStart: String(entry.shot_start),
        shotEnd: String(entry.shot_end),
        goodPieces: String(entry.good_pieces),
        rejectedPieces: String(entry.rejected_pieces),
      },
    };
  }
  const { waste } = record;
  return {
    waste: {
      shiftDate: waste.shift_date,
      shift: waste.shift,
      wasteMaterialId: waste.waste_material_id,
      scrapLocationId: waste.scrap_location_id,
      kilograms: {
        RUNNER: kilograms(waste.runner_grams),
        REJECT: kilograms(waste.reject_grams),
        PURGE: kilograms(waste.purge_grams),
        SWEEPINGS: kilograms(waste.sweepings_grams),
      },
    },
  };
}
