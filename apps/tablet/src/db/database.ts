import { migrate } from './migrations';

export type Value = string | number | null;

export interface Statements {
  all<T>(sql: string, ...params: Value[]): Promise<T[]>;
  first<T>(sql: string, ...params: Value[]): Promise<T | null>;
  run(sql: string, ...params: Value[]): Promise<void>;
}

export interface Database extends Statements {
  /** All or nothing, one at a time; screens read again after each. */
  write(work: (tx: Statements) => Promise<void>): Promise<void>;
  onChange(listener: () => void): () => void;
}

/** The little the app needs from an SQLite driver: expo-sqlite, or Node's in tests. */
export interface Driver {
  all(sql: string, params: Value[]): Promise<unknown[]>;
  run(sql: string, params: Value[]): Promise<void>;
  exec(sql: string): Promise<void>;
}

export async function createDatabase(driver: Driver): Promise<Database> {
  await migrate(driver);
  const listeners = new Set<() => void>();
  let lastWrite = Promise.resolve();

  const statements: Statements = {
    async all<T>(sql: string, ...params: Value[]) {
      return (await driver.all(sql, params)) as T[];
    },
    async first<T>(sql: string, ...params: Value[]) {
      const [row] = await driver.all(sql, params);
      return (row ?? null) as T | null;
    },
    run: (sql, ...params) => driver.run(sql, params),
  };

  // One connection: a pull being applied and an entry being saved must not
  // end up in the same transaction, so writes wait their turn.
  function write(work: (tx: Statements) => Promise<void>) {
    const turn = lastWrite.then(async () => {
      await driver.exec('BEGIN');
      try {
        await work(statements);
        await driver.exec('COMMIT');
      } catch (error) {
        await driver.exec('ROLLBACK');
        throw error;
      }
      listeners.forEach((listener) => listener());
    });
    lastWrite = turn.catch(() => undefined);
    return turn;
  }

  return {
    ...statements,
    write,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
