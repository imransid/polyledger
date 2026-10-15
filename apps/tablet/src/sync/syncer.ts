import { type Api, ApiError } from '../api/client';
import type { Database } from '../db/database';
import { synchronize } from './engine';

export interface SyncRun {
  syncing: boolean;
  /** The last try didn't get through; the next one may. */
  failed: boolean;
}

/**
 * Runs one sync at a time, whoever asks (the timer, the button), and keeps
 * how the last one went for the screens to show.
 */
export function createSyncer(db: Database, api: Api, onUnpaired: () => void) {
  let run: SyncRun = { syncing: false, failed: false };
  const listeners = new Set<() => void>();
  const update = (next: SyncRun) => {
    run = next;
    listeners.forEach((listener) => listener());
  };

  async function syncNow() {
    if (run.syncing) {
      return;
    }
    update({ ...run, syncing: true });
    try {
      await synchronize(db, api);
      update({ syncing: false, failed: false });
    } catch (error) {
      update({ syncing: false, failed: true });
      if (error instanceof ApiError && error.status === 401) {
        onUnpaired();
      } else if (!(error instanceof ApiError)) {
        console.error(error);
      }
    }
  }

  return {
    syncNow,
    current: () => run,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
