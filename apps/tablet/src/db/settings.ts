import type { Statements } from './database';

type Key = 'device' | 'session' | 'language' | 'last_pulled_at';

export async function readSetting(
  db: Statements,
  key: Key,
): Promise<string | null> {
  const row = await db.first<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

/** Null forgets the setting. */
export function writeSetting(
  tx: Statements,
  key: Key,
  value: string | null,
): Promise<void> {
  return value === null
    ? tx.run('DELETE FROM settings WHERE key = ?', key)
    : tx.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        key,
        value,
      );
}
