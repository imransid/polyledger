import * as SecureStore from 'expo-secure-store';
import type { Pairing } from '../api/client';
import type { Statements } from '../db/database';
import { readSetting, writeSetting } from '../db/settings';

export type PairedDevice = Pairing['device'];

// The token proves which tablet is calling, so it lives in the Android
// Keystore, not in the database with everything else, and in memory while
// the app runs.
const TOKEN_KEY = 'device-token';
let deviceToken: string | null = null;

export const currentDeviceToken = () => deviceToken;

export async function loadDeviceToken(): Promise<string | null> {
  deviceToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return deviceToken;
}

export async function saveDeviceToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  deviceToken = token;
}

export async function forgetDeviceToken(): Promise<void> {
  deviceToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function readDevice(db: Statements): Promise<PairedDevice | null> {
  const saved = await readSetting(db, 'device');
  return saved === null ? null : (JSON.parse(saved) as PairedDevice);
}

/**
 * A new pairing, or none: either way the next pull starts afresh and nobody
 * is signed in. Records not yet sent stay and go once paired again.
 */
export async function savePairing(
  tx: Statements,
  device: PairedDevice | null,
): Promise<void> {
  await writeSetting(tx, 'device', device && JSON.stringify(device));
  await writeSetting(tx, 'last_pulled_at', null);
  await writeSetting(tx, 'session', null);
}
