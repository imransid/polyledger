import { describe, expect, it } from 'vitest';
import type { Rejection } from '@/api/types';
import { prefillFrom } from './prefill';

const refused = (fields: Partial<Rejection>): Rejection => ({
  id: '00000000-0000-4000-8000-000000000a01',
  kind: 'PRODUCTION_ENTRY',
  status: 'REJECTED',
  reason: 'Not enough stock for RM-PP-01',
  deviceId: '00000000-0000-4000-8000-000000000a02',
  deviceName: 'Hall A tablet',
  recordedByName: 'Shahin Alam',
  jobCardId: '00000000-0000-4000-8000-000000000501',
  jobCardNumber: 'JC-000001',
  payload: {},
  deviceRecordedAt: '2026-10-15T08:00:00.000Z',
  receivedAt: '2026-10-15T09:00:00.000Z',
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: null,
  ...fields,
});

describe('prefillFrom', () => {
  it('fills the shift form from a refused production entry', () => {
    expect(
      prefillFrom(
        refused({
          payload: {
            shift_date: '2026-10-15',
            shift: 'B',
            operator_id: 'op-1',
            shot_start: 260,
            shot_end: 520,
            good_pieces: 1_000,
            rejected_pieces: 40,
          },
        }),
      ),
    ).toEqual({
      entry: {
        shiftDate: '2026-10-15',
        shift: 'B',
        operatorId: 'op-1',
        shotStart: '260',
        shotEnd: '520',
        goodPieces: '1000',
        rejectedPieces: '40',
      },
    });
  });

  it('turns the grams the tablet sends into kilograms, leaving nothing weighed blank', () => {
    expect(
      prefillFrom(
        refused({
          kind: 'WASTE_ENTRY',
          payload: {
            shift_date: '2026-10-15',
            shift: 'A',
            waste_material_id: 'rg-1',
            scrap_location_id: 'scrap-1',
            runner_grams: 500,
            reject_grams: 0,
            purge_grams: 1_250,
            sweepings_grams: 0,
          },
        }),
      ),
    ).toEqual({
      waste: {
        shiftDate: '2026-10-15',
        shift: 'A',
        wasteMaterialId: 'rg-1',
        scrapLocationId: 'scrap-1',
        kilograms: { RUNNER: '0.5', REJECT: '', PURGE: '1.25', SWEEPINGS: '' },
      },
    });
  });

  it('gives nothing for a record that does not read', () => {
    expect(prefillFrom(refused({ payload: { shift: 'D' } }))).toBeNull();
  });
});
