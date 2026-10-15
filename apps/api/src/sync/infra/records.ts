import { z } from 'zod';
import { INT_MAX } from '../../common/quantities.js';
import { Shift, type SyncRecordKind } from '../../generated/prisma/client.js';
import type { WasteLine } from '../../production/domain/waste.js';

const whole = z.number().int().min(0).max(INT_MAX);

const anyEntry = {
  id: z.uuid(),
  session_id: z.uuid().describe('The sign-in the record was made in'),
  job_card_id: z.uuid(),
  shift_date: z.iso.date(),
  shift: z.enum(Shift),
  recorded_at: z
    .number()
    .int()
    .positive()
    .describe('The tablet clock in milliseconds; kept for reference only'),
};

export const productionRecord = z
  .object({
    ...anyEntry,
    operator_id: z.uuid(),
    shot_start: whole,
    shot_end: whole,
    good_pieces: whole,
    rejected_pieces: whole,
  })
  .refine((entry) => entry.shot_end >= entry.shot_start, {
    message: 'The shot counter end cannot be before its start',
  });

/** Whole grams: the tablet never sends kilograms or fractions. */
export const wasteRecord = z
  .object({
    ...anyEntry,
    waste_material_id: z.uuid(),
    scrap_location_id: z.uuid(),
    runner_grams: whole,
    reject_grams: whole,
    purge_grams: whole,
    sweepings_grams: whole,
  })
  .refine((entry) => wasteLines(entry).length > 0, {
    message: 'Weigh at least one kind of waste',
  })
  .refine(
    (entry) =>
      wasteLines(entry).reduce((sum, line) => sum + line.grams, 0) <= INT_MAX,
    { message: 'The waste weighs more than one entry can hold' },
  );

export type ProductionRecord = z.infer<typeof productionRecord>;
export type WasteRecord = z.infer<typeof wasteRecord>;

/** The WatermelonDB tables a tablet pushes, and the kind each one holds. */
export const PUSHED_TABLES = {
  production_entries: 'PRODUCTION_ENTRY',
  waste_entries: 'WASTE_ENTRY',
} as const satisfies Record<string, SyncRecordKind>;

export type PushedTable = keyof typeof PUSHED_TABLES;

export type TabletEntry =
  | { kind: 'PRODUCTION_ENTRY'; record: ProductionRecord }
  | { kind: 'WASTE_ENTRY'; record: WasteRecord };

/** The entry, or why it can't be read. */
export function readRecord(
  table: PushedTable,
  raw: unknown,
): TabletEntry | string {
  const parsed =
    table === 'production_entries'
      ? productionRecord.safeParse(raw)
      : wasteRecord.safeParse(raw);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const field = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `Invalid record: ${field}${issue.message}`;
  }
  return table === 'production_entries'
    ? { kind: 'PRODUCTION_ENTRY', record: parsed.data as ProductionRecord }
    : { kind: 'WASTE_ENTRY', record: parsed.data as WasteRecord };
}

export function wasteLines(entry: {
  runner_grams: number;
  reject_grams: number;
  purge_grams: number;
  sweepings_grams: number;
}): WasteLine[] {
  const lines: WasteLine[] = [
    { wasteType: 'RUNNER', grams: entry.runner_grams },
    { wasteType: 'REJECT', grams: entry.reject_grams },
    { wasteType: 'PURGE', grams: entry.purge_grams },
    { wasteType: 'SWEEPINGS', grams: entry.sweepings_grams },
  ];
  return lines.filter((line) => line.grams > 0);
}
