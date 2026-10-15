import type { Api, Pulled } from '../api/client';
import type { Database, Statements, Value } from '../db/database';
import { readSetting, writeSetting } from '../db/settings';

type PulledTables = Pulled['changes'];
type Row = Record<string, Value>;

// Table and column names in the SQL below come only from these lists, never
// from the server; the values are always bound.
const PULLED = {
  job_cards: [
    'id',
    'number',
    'product_id',
    'mould_id',
    'machine_id',
    'piece_weight_mg',
    'cavities',
    'runner_weight_mg',
    'planned_pieces',
    'planned_start_date',
    'status',
  ],
  products: ['id', 'code', 'name', 'piece_weight_mg', 'colour'],
  moulds: ['id', 'code', 'name', 'product_id', 'cavities', 'status'],
  machines: ['id', 'code', 'name', 'status'],
  operators: ['id', 'name'],
  tablet_users: ['id', 'name', 'role'],
  raw_materials: ['id', 'code', 'name'],
  locations: ['id', 'code', 'name'],
  rejections: [
    'id',
    'kind',
    'job_card_id',
    'job_card_number',
    'reason',
    'recorded_at',
  ],
} as const satisfies {
  [
    Table in keyof PulledTables
  ]: readonly (keyof PulledTables[Table]['created'][number])[];
};

const PUSHED = {
  production_entries: {
    kind: 'PRODUCTION_ENTRY',
    columns: [
      'id',
      'session_id',
      'job_card_id',
      'shift_date',
      'shift',
      'operator_id',
      'shot_start',
      'shot_end',
      'good_pieces',
      'rejected_pieces',
      'recorded_at',
    ],
  },
  waste_entries: {
    kind: 'WASTE_ENTRY',
    columns: [
      'id',
      'session_id',
      'job_card_id',
      'shift_date',
      'shift',
      'waste_material_id',
      'scrap_location_id',
      'runner_grams',
      'reject_grams',
      'purge_grams',
      'sweepings_grams',
      'recorded_at',
    ],
  },
} as const;

type PushedTable = keyof typeof PUSHED;

/** Sends what was recorded here, then brings the floor's lists up to date. */
export async function synchronize(db: Database, api: Api): Promise<void> {
  await push(db, api);
  await pull(db, api);
}

export interface SyncState {
  /** Server time of the last pull, in milliseconds. */
  lastSyncedAt: number | null;
  /** Entries recorded here and not yet sent. */
  waiting: number;
}

export async function readSyncState(db: Database): Promise<SyncState> {
  const lastPulledAt = await readSetting(db, 'last_pulled_at');
  const counted = await db.first<{ waiting: number }>(
    `SELECT
       (SELECT COUNT(*) FROM production_entries WHERE synced_at IS NULL) +
       (SELECT COUNT(*) FROM waste_entries WHERE synced_at IS NULL) AS waiting`,
  );
  return {
    lastSyncedAt: lastPulledAt === null ? null : Number(lastPulledAt),
    waiting: counted?.waiting ?? 0,
  };
}

// Tablets only add records, so everything not yet sent goes as created. The
// server answers for each record; one it refuses is kept for a supervisor
// and not sent again, as it would only be refused again.
async function push(db: Database, api: Api) {
  const waiting = {} as Record<PushedTable, Row[]>;
  for (const table of tablesOf(PUSHED)) {
    waiting[table] = await db.all<Row>(
      `SELECT ${PUSHED[table].columns.join(', ')} FROM ${table}
       WHERE synced_at IS NULL ORDER BY recorded_at`,
    );
  }
  if (tablesOf(PUSHED).every((table) => waiting[table].length === 0)) {
    return;
  }

  const { accepted, rejected } = await api.push({
    production_entries: {
      created: waiting.production_entries as { id: string }[],
      updated: [],
      deleted: [],
    },
    waste_entries: {
      created: waiting.waste_entries as { id: string }[],
      updated: [],
      deleted: [],
    },
  });

  const acceptedIds = new Set(accepted);
  const refusals = new Map(rejected.map((record) => [record.id, record]));
  const syncedAt = Date.now();
  await db.write(async (tx) => {
    for (const table of tablesOf(PUSHED)) {
      for (const record of waiting[table]) {
        const id = String(record.id);
        const refusal = refusals.get(id);
        if (!acceptedIds.has(id) && !refusal) {
          continue;
        }
        await tx.run(
          `UPDATE ${table} SET synced_at = ? WHERE id = ?`,
          syncedAt,
          id,
        );
        if (refusal) {
          await keepRefusal(tx, table, record, refusal.reason);
        }
      }
    }
  });
}

function keepRefusal(
  tx: Statements,
  table: PushedTable,
  record: Row,
  reason: string,
) {
  return tx.run(
    `INSERT OR REPLACE INTO rejections
       (id, kind, job_card_id, job_card_number, reason, recorded_at)
     VALUES (?, ?, ?, (SELECT number FROM job_cards WHERE id = ?), ?, ?)`,
    record.id,
    PUSHED[table].kind,
    record.job_card_id,
    record.job_card_id,
    reason,
    record.recorded_at,
  );
}

async function pull(db: Database, api: Api) {
  const lastPulledAt = await readSetting(db, 'last_pulled_at');
  const { changes, timestamp } = await api.pull(lastPulledAt);
  await db.write(async (tx) => {
    for (const table of tablesOf(PULLED)) {
      await apply(tx, table, changes[table], lastPulledAt === null);
    }
    await writeSetting(tx, 'last_pulled_at', String(timestamp));
  });
}

// A first pull brings everything still on the list, so whatever was here
// before (an earlier pairing) goes.
async function apply(
  tx: Statements,
  table: keyof typeof PULLED,
  changes: { created: object[]; updated: object[]; deleted: string[] },
  firstPull: boolean,
) {
  const columns = PULLED[table];
  if (firstPull) {
    await tx.run(`DELETE FROM ${table}`);
  }
  const upsert = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})`;
  for (const record of [...changes.created, ...changes.updated] as Row[]) {
    await tx.run(upsert, ...columns.map((column) => record[column]));
  }
  for (const id of changes.deleted) {
    await tx.run(`DELETE FROM ${table} WHERE id = ?`, id);
  }
}

function tablesOf<T extends object>(tables: T) {
  return Object.keys(tables) as (keyof T & string)[];
}
