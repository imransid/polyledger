import type { Statements } from '../db/database';

export const machine = {
  id: 'machine-1',
  code: 'IM-01',
  name: 'Haitian MA900',
  status: 'ACTIVE' as const,
};

export const product = {
  id: 'product-1',
  code: 'CAP-28',
  name: 'Bottle cap 28 mm',
  piece_weight_mg: 2_500,
  colour: 'Red',
};

export const jobCard = {
  id: 'card-1',
  number: 'JC-2026-0001',
  product_id: product.id,
  mould_id: 'mould-1',
  machine_id: machine.id,
  piece_weight_mg: 2_500,
  cavities: 4,
  runner_weight_mg: 2_000,
  planned_pieces: 120_000,
  planned_start_date: '2026-10-15',
  status: 'RUNNING' as const,
};

export function productionEntry(id: string, recordedAt: number) {
  return {
    id,
    session_id: 'session-1',
    job_card_id: jobCard.id,
    shift_date: '2026-10-15',
    shift: 'A',
    operator_id: 'operator-1',
    shot_start: 0,
    shot_end: 260,
    good_pieces: 1_000,
    rejected_pieces: 40,
    recorded_at: recordedAt,
  };
}

export function wasteEntry(id: string, recordedAt: number) {
  return {
    id,
    session_id: 'session-1',
    job_card_id: jobCard.id,
    shift_date: '2026-10-15',
    shift: 'A',
    waste_material_id: 'regrind-1',
    scrap_location_id: 'scrap-1',
    runner_grams: 500,
    reject_grams: 0,
    purge_grams: 1_000,
    sweepings_grams: 0,
    recorded_at: recordedAt,
  };
}

/** As a 9c entry screen will: a row in the table, not yet sent. */
export function record(
  tx: Statements,
  table: 'production_entries' | 'waste_entries',
  entry: Record<string, string | number>,
) {
  const columns = Object.keys(entry);
  return tx.run(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    ...Object.values(entry),
  );
}
