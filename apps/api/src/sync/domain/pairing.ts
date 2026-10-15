import { createHash, randomBytes, randomInt } from 'node:crypto';

export const PAIRING_CODE_LIFETIME_MS = 30 * 60_000;

// Read off one screen and typed into another, so no 0/O or 1/I/L.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function newPairingCode(): string {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');
}

/** As typed on the tablet ("abcd-efgh") to the code as issued. */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function newDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('base64url');
}

export type DeviceStatus = 'PAIRING' | 'CODE_EXPIRED' | 'PAIRED' | 'REVOKED';

export function deviceStatus(
  device: {
    revokedAt: Date | null;
    tokenHash: string | null;
    pairingExpiresAt: Date | null;
  },
  now = new Date(),
): DeviceStatus {
  if (device.revokedAt) {
    return 'REVOKED';
  }
  if (device.tokenHash) {
    return 'PAIRED';
  }
  return device.pairingExpiresAt && device.pairingExpiresAt > now
    ? 'PAIRING'
    : 'CODE_EXPIRED';
}
