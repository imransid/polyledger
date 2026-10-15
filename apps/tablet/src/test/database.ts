import { DatabaseSync } from 'node:sqlite';
import { createDatabase, type Database } from '../db/database';

/** The app's database on Node's SQLite, in memory. */
export function testDatabase(): Promise<Database> {
  const sqlite = new DatabaseSync(':memory:');
  return createDatabase({
    all: async (sql, params) => sqlite.prepare(sql).all(...params),
    run: async (sql, params) => {
      sqlite.prepare(sql).run(...params);
    },
    exec: async (sql) => sqlite.exec(sql),
  });
}
