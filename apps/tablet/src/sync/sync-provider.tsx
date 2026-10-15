import { useNetworkState } from 'expo-network';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useApp, useQuery } from '../app-context';
import { readSyncState, type SyncState } from './engine';
import { createSyncer, type SyncRun } from './syncer';

const SYNC_EVERY_MS = 5 * 60_000;

interface SyncStatus extends SyncState, SyncRun {
  online: boolean;
  syncNow: () => void;
}

const SyncContext = createContext<SyncStatus | null>(null);

export function useSync(): SyncStatus {
  const status = useContext(SyncContext);
  if (!status) {
    throw new Error('useSync needs a SyncProvider above it');
  }
  return status;
}

interface SyncProviderProps {
  /** The server no longer knows this tablet's token. */
  onUnpaired: () => void;
  children: ReactNode;
}

// Syncs when the app opens, when the network comes back, every few minutes
// while online, and when asked.
export function SyncProvider({ onUnpaired, children }: SyncProviderProps) {
  const { db, api } = useApp();
  const syncer = useMemo(
    () => createSyncer(db, api, onUnpaired),
    [db, api, onUnpaired],
  );
  const run = useSyncExternalStore(syncer.subscribe, syncer.current);
  const state = useQuery(readSyncState);
  // Joined to a network, not "reaches the internet": the factory server may
  // sit on a network without one.
  const online = useNetworkState().isConnected === true;

  useEffect(() => {
    if (!online) {
      return;
    }
    void syncer.syncNow();
    const timer = setInterval(() => void syncer.syncNow(), SYNC_EVERY_MS);
    return () => clearInterval(timer);
  }, [online, syncer]);

  const status = useMemo(
    () => ({
      ...run,
      online,
      lastSyncedAt: state?.lastSyncedAt ?? null,
      waiting: state?.waiting ?? 0,
      syncNow: () => void syncer.syncNow(),
    }),
    [run, online, state, syncer],
  );
  return <SyncContext.Provider value={status}>{children}</SyncContext.Provider>;
}
