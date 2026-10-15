import { openDatabaseAsync } from 'expo-sqlite';
import { createDatabase, type Database } from './database';

export async function openDatabase(): Promise<Database> {
  const sqlite = await openDatabaseAsync('polyledger.db');
  return createDatabase({
    all: (sql, params) => sqlite.getAllAsync(sql, params),
    run: async (sql, params) => {
      await sqlite.runAsync(sql, params);
    },
    exec: (sql) => sqlite.execAsync(sql),
  });
}
