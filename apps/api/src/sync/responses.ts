import { z } from 'zod';
import {
  JobCardStatus,
  MachineStatus,
  MouldStatus,
  Role,
  SyncRecordKind,
} from '../generated/prisma/client.js';

const moment = z.iso.datetime();
const whole = z.number().int();

export const deviceResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  floorLocationId: z.uuid(),
  status: z.enum(['PAIRING', 'CODE_EXPIRED', 'PAIRED', 'REVOKED']),
  /** Until when the last pairing code works; null once used. */
  pairingExpiresAt: moment.nullable(),
  pairedAt: moment.nullable(),
  lastSeenAt: moment.nullable(),
  revokedAt: moment.nullable(),
  createdAt: moment,
});

export const pairingCodeResponse = z.object({
  device: deviceResponse,
  /** Shown once: only its hash is kept. */
  pairingCode: z.string(),
});

const pairedDevice = z.object({
  id: z.uuid(),
  name: z.string(),
  floorLocationId: z.uuid(),
});

export const pairingResponse = z.object({
  /** Sent back as X-Device-Token on every sync call. */
  deviceToken: z.string(),
  device: pairedDevice,
});

export const sessionResponse = z.object({
  /** Put on every record made while signed in. */
  sessionId: z.uuid(),
  user: z.object({ id: z.uuid(), name: z.string(), role: z.enum(Role) }),
  startedAt: moment,
  expiresAt: moment,
});

const tableChanges = <T extends z.ZodType>(record: T) =>
  z.object({
    created: z.array(record),
    updated: z.array(record),
    deleted: z.array(z.uuid()),
  });

const named = { id: z.uuid(), code: z.string(), name: z.string() };

export const pullResponse = z.object({
  changes: z.object({
    job_cards: tableChanges(
      z.object({
        id: z.uuid(),
        number: z.string(),
        product_id: z.uuid(),
        mould_id: z.uuid(),
        machine_id: z.uuid(),
        piece_weight_mg: whole,
        cavities: whole,
        runner_weight_mg: whole,
        planned_pieces: whole,
        planned_start_date: z.iso.date(),
        status: z.enum(JobCardStatus),
      }),
    ),
    products: tableChanges(
      z.object({ ...named, piece_weight_mg: whole, colour: z.string() }),
    ),
    moulds: tableChanges(
      z.object({
        ...named,
        product_id: z.uuid(),
        cavities: whole,
        status: z.enum(MouldStatus),
      }),
    ),
    machines: tableChanges(
      z.object({ ...named, status: z.enum(MachineStatus) }),
    ),
    operators: tableChanges(z.object({ id: z.uuid(), name: z.string() })),
    raw_materials: tableChanges(z.object(named)),
    locations: tableChanges(z.object(named)),
  }),
  /** The next pull's lastPulledAt, in milliseconds. */
  timestamp: whole,
});

export const pushResponse = z.object({
  accepted: z.array(z.uuid()),
  rejected: z.array(
    z.object({ id: z.string(), table: z.string(), reason: z.string() }),
  ),
});

export const rejectionResponse = z.object({
  id: z.uuid(),
  kind: z.enum(SyncRecordKind),
  status: z.enum(['REJECTED', 'RESOLVED', 'DISMISSED']),
  reason: z.string(),
  deviceId: z.uuid(),
  deviceName: z.string(),
  recordedByName: z.string().nullable(),
  jobCardId: z.uuid().nullable(),
  jobCardNumber: z.string().nullable(),
  /** As the tablet sent it. */
  payload: z.record(z.string(), z.unknown()),
  deviceRecordedAt: moment.nullable(),
  receivedAt: moment,
  reviewedByName: z.string().nullable(),
  reviewedAt: moment.nullable(),
  reviewNote: z.string().nullable(),
});
