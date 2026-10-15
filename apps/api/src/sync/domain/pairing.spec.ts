import { describe, expect, it } from 'vitest';
import {
  deviceStatus,
  hashSecret,
  newPairingCode,
  normalizePairingCode,
} from './pairing.js';

describe('pairing', () => {
  it('issues eight characters that cannot be misread', () => {
    const code = newPairingCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });

  it('reads the code however it was typed', () => {
    expect(normalizePairingCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizePairingCode(' ABCD EFGH ')).toBe('ABCDEFGH');
    expect(hashSecret('ABCDEFGH')).toBe(hashSecret('ABCDEFGH'));
  });

  it('tells pairing, expired, paired and revoked tablets apart', () => {
    const now = new Date('2026-10-15T08:00:00Z');
    const later = new Date('2026-10-15T08:30:00Z');
    const device = {
      revokedAt: null,
      tokenHash: null,
      pairingExpiresAt: later,
    };

    expect(deviceStatus(device, now)).toBe('PAIRING');
    expect(deviceStatus(device, later)).toBe('CODE_EXPIRED');
    expect(deviceStatus({ ...device, tokenHash: 'x' }, now)).toBe('PAIRED');
    expect(deviceStatus({ ...device, revokedAt: now }, now)).toBe('REVOKED');
  });
});
