import type { Driver } from './database';

// Each step moves the tablet's database one version on. Never change a step
// that has shipped: add a new one. STRICT tables refuse a fraction in a
// whole-number column, so grams stay whole here too.
const STEPS = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;

  CREATE TABLE job_cards (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL,
    product_id TEXT NOT NULL,
    mould_id TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    piece_weight_mg INTEGER NOT NULL,
    cavities INTEGER NOT NULL,
    runner_weight_mg INTEGER NOT NULL,
    planned_pieces INTEGER NOT NULL,
    planned_start_date TEXT NOT NULL,
    status TEXT NOT NULL
  ) STRICT;

  CREATE TABLE products (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    piece_weight_mg INTEGER NOT NULL,
    colour TEXT NOT NULL
  ) STRICT;

  CREATE TABLE moulds (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    product_id TEXT NOT NULL,
    cavities INTEGER NOT NULL,
    status TEXT NOT NULL
  ) STRICT;

  CREATE TABLE machines (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL
  ) STRICT;

  CREATE TABLE operators (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;

  CREATE TABLE tablet_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL
  ) STRICT;

  CREATE TABLE raw_materials (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL
  ) STRICT;

  CREATE TABLE locations (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL
  ) STRICT;

  CREATE TABLE rejections (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    job_card_id TEXT,
    job_card_number TEXT,
    reason TEXT NOT NULL,
    recorded_at INTEGER
  ) STRICT;

  CREATE TABLE production_entries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    job_card_id TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    shift TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    shot_start INTEGER NOT NULL,
    shot_end INTEGER NOT NULL,
    good_pieces INTEGER NOT NULL,
    rejected_pieces INTEGER NOT NULL,
    recorded_at INTEGER NOT NULL,
    synced_at INTEGER
  ) STRICT;

  CREATE TABLE waste_entries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    job_card_id TEXT NOT NULL,
    shift_date TEXT NOT NULL,
    shift TEXT NOT NULL,
    waste_material_id TEXT NOT NULL,
    scrap_location_id TEXT NOT NULL,
    runner_grams INTEGER NOT NULL,
    reject_grams INTEGER NOT NULL,
    purge_grams INTEGER NOT NULL,
    sweepings_grams INTEGER NOT NULL,
    recorded_at INTEGER NOT NULL,
    synced_at INTEGER
  ) STRICT;
  `,
];

export async function migrate(driver: Driver): Promise<void> {
  const [{ user_version: version }] = (await driver.all(
    'PRAGMA user_version',
    [],
  )) as { user_version: number }[];
  for (const [index, step] of STEPS.entries()) {
    if (index < version) {
      continue;
    }
    await driver.exec(
      `BEGIN; ${step}; PRAGMA user_version = ${index + 1}; COMMIT;`,
    );
  }
}
