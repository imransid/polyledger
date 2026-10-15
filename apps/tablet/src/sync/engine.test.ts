import { beforeEach, describe, expect, it } from '@jest/globals';
import { ApiError } from '../api/client';
import type { Database } from '../db/database';
import { testDatabase } from '../test/database';
import { fakeApi, pulled } from '../test/fake-api';
import {
  jobCard,
  machine,
  product,
  productionEntry,
  record,
  wasteEntry,
} from '../test/floor';
import { readSyncState, synchronize } from './engine';

describe('sync engine', () => {
  let db: Database;

  beforeEach(async () => {
    db = await testDatabase();
  });

  it('fills the floor lists on the first pull, then applies only what changed', async () => {
    await db.write((tx) =>
      tx.run(
        "INSERT INTO machines (id, code, name, status) VALUES ('old', 'IM-99', 'From an earlier pairing', 'ACTIVE')",
      ),
    );
    const pulls = [
      pulled(1_000, {
        job_cards: { created: [jobCard] },
        machines: { created: [machine] },
        products: { created: [product] },
        tablet_users: {
          created: [{ id: 'user-1', name: 'Rahim', role: 'OPERATOR' }],
        },
      }),
      pulled(2_000, {
        job_cards: { deleted: [jobCard.id] },
        machines: { updated: [{ ...machine, name: 'Haitian MA1600' }] },
      }),
    ];
    const { api, calls } = fakeApi({
      'GET /sync/pull': () => ({ body: pulls.shift() }),
    });

    await synchronize(db, api);

    expect(calls[0].query.has('lastPulledAt')).toBe(false);
    expect(calls[0].headers.get('X-Device-Token')).toBe('tablet-token');
    expect(await db.all('SELECT * FROM job_cards')).toEqual([jobCard]);
    expect(await db.all('SELECT id, name FROM machines')).toEqual([
      { id: machine.id, name: machine.name },
    ]);
    expect(await db.all('SELECT * FROM tablet_users')).toEqual([
      { id: 'user-1', name: 'Rahim', role: 'OPERATOR' },
    ]);
    expect(await readSyncState(db)).toEqual({
      lastSyncedAt: 1_000,
      waiting: 0,
    });

    await synchronize(db, api);

    expect(calls[1].query.get('lastPulledAt')).toBe('1000');
    expect(await db.all('SELECT * FROM job_cards')).toEqual([]);
    expect(await db.all('SELECT name FROM machines')).toEqual([
      { name: 'Haitian MA1600' },
    ]);
    expect(await db.all('SELECT id FROM products')).toEqual([
      { id: product.id },
    ]);
    expect((await readSyncState(db)).lastSyncedAt).toBe(2_000);
  });

  it('sends only records not yet sent, as created, oldest first', async () => {
    await db.write(async (tx) => {
      await record(tx, 'production_entries', productionEntry('later', 300));
      await record(tx, 'production_entries', productionEntry('earlier', 100));
      await record(tx, 'waste_entries', wasteEntry('waste', 200));
      await record(tx, 'production_entries', {
        ...productionEntry('sent', 50),
        synced_at: 60,
      });
    });
    expect((await readSyncState(db)).waiting).toBe(3);
    const { api, calls } = fakeApi({
      'POST /sync/push': () => ({
        body: { accepted: ['earlier', 'later', 'waste'], rejected: [] },
      }),
      'GET /sync/pull': () => ({ body: pulled(1_000) }),
    });

    await synchronize(db, api);

    expect(calls.map((call) => call.route)).toEqual([
      'POST /sync/push',
      'GET /sync/pull',
    ]);
    expect(calls[0].body).toEqual({
      changes: {
        production_entries: {
          created: [
            productionEntry('earlier', 100),
            productionEntry('later', 300),
          ],
          updated: [],
          deleted: [],
        },
        waste_entries: {
          created: [wasteEntry('waste', 200)],
          updated: [],
          deleted: [],
        },
      },
    });
    expect((await readSyncState(db)).waiting).toBe(0);

    await synchronize(db, api);

    expect(calls.map((call) => call.route).slice(2)).toEqual([
      'GET /sync/pull',
    ]);
  });

  it('keeps refused records for a supervisor and does not send them again', async () => {
    const reason =
      'JC-2026-0001 already has an entry for shift A on 2026-10-15';
    const pulls = [
      pulled(1_000, { job_cards: { created: [jobCard] } }),
      pulled(2_000),
      pulled(3_000),
    ];
    const { api, calls } = fakeApi({
      'GET /sync/pull': () => ({ body: pulls.shift() }),
      'POST /sync/push': () => ({
        body: {
          accepted: ['fine'],
          rejected: [{ id: 'twice', table: 'production_entries', reason }],
        },
      }),
    });
    await synchronize(db, api);
    await db.write(async (tx) => {
      await record(tx, 'production_entries', productionEntry('twice', 100));
      await record(tx, 'waste_entries', wasteEntry('fine', 200));
    });

    await synchronize(db, api);

    expect(await db.all('SELECT * FROM rejections')).toEqual([
      {
        id: 'twice',
        kind: 'PRODUCTION_ENTRY',
        job_card_id: jobCard.id,
        job_card_number: jobCard.number,
        reason,
        recorded_at: 100,
      },
    ]);
    expect((await readSyncState(db)).waiting).toBe(0);

    await synchronize(db, api);

    expect(calls.map((call) => call.route)).toEqual([
      'GET /sync/pull',
      'POST /sync/push',
      'GET /sync/pull',
      'GET /sync/pull',
    ]);
  });

  it('keeps records waiting when the server cannot be reached', async () => {
    await db.write((tx) =>
      record(tx, 'production_entries', productionEntry('waiting', 100)),
    );
    const { api } = fakeApi({ 'POST /sync/push': () => 'offline' });

    await expect(synchronize(db, api)).rejects.toEqual(
      new ApiError(0, 'Could not reach the server'),
    );

    expect((await readSyncState(db)).waiting).toBe(1);
  });

  it('says so when the tablet is no longer paired', async () => {
    const { api } = fakeApi({
      'GET /sync/pull': () => ({
        status: 401,
        body: { statusCode: 401, message: 'This tablet is not paired' },
      }),
    });

    await expect(synchronize(db, api)).rejects.toMatchObject({
      status: 401,
      message: 'This tablet is not paired',
    });
  });
});
