import type { Device, SyncedRecord } from '../../generated/prisma/client.js';
import { type DeviceStatus, deviceStatus } from '../domain/pairing.js';

export type DeviceView = Pick<
  Device,
  | 'id'
  | 'name'
  | 'floorLocationId'
  | 'pairingExpiresAt'
  | 'pairedAt'
  | 'lastSeenAt'
  | 'revokedAt'
  | 'createdAt'
> & { status: DeviceStatus };

// Never the hashes: they stay in the database.
export function toDeviceView(device: Device): DeviceView {
  return {
    id: device.id,
    name: device.name,
    floorLocationId: device.floorLocationId,
    status: deviceStatus(device),
    pairingExpiresAt: device.pairingExpiresAt,
    pairedAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
    createdAt: device.createdAt,
  };
}

/** What the tablet hears back about one of its records. */
export type RecordOutcome =
  | { accepted: string }
  | { rejected: { id: string; table: string; reason: string } };

export function outcomeOf(record: SyncedRecord, table: string): RecordOutcome {
  return record.status === 'ACCEPTED'
    ? { accepted: record.id }
    : { rejected: { id: record.id, table, reason: record.reason! } };
}
