import { createContext, useContext, useEffect, useState } from 'react';
import type { Api } from './api/client';
import type { Database } from './db/database';

interface AppServices {
  db: Database;
  api: Api;
}

export const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
  const app = useContext(AppContext);
  if (!app) {
    throw new Error('useApp needs an AppContext above it');
  }
  return app;
}

/** What `read` finds in the local database, read again after every write. */
export function useQuery<T>(read: (db: Database) => Promise<T>): T | undefined {
  const { db } = useApp();
  const [result, setResult] = useState<T>();
  useEffect(() => {
    let current = true;
    const load = () =>
      read(db).then((value) => {
        if (current) {
          setResult(value);
        }
      });
    void load();
    const stop = db.onChange(load);
    return () => {
      current = false;
      stop();
    };
  }, [db, read]);
  return result;
}
