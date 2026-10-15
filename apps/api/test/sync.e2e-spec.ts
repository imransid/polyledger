import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { pinsResponse } from '../src/auth/responses.js';
import { pageOf } from '../src/common/list-query.js';
import { addDays, factoryToday } from '../src/common/dates.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import {
  deviceResponse,
  pairingCodeResponse,
  pairingResponse,
  pullResponse,
  pushResponse,
  rejectionResponse,
  sessionResponse,
} from '../src/sync/responses.js';
import {
  type Api,
  apiFor,
  createUser,
  logIn,
  startApp,
  tokenFor,
} from './support.js';

const { OWNER, MANAGER, SUPERVISOR } = Role;

// Written out rather than imported, so a wrong role list in the code fails.
const ACCESS = {
  devices: [OWNER],
  pins: [OWNER, MANAGER],
  rejections: [OWNER, MANAGER, SUPERVISOR],
};

const HOUR = 3_600_000;

describe('tablet sync', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Api;
  let manager: Api;
  let supervisor: Api;
  let storekeeper: Api;
  let operatorId: string;
  let pp: string;
  let mb: string;
  let regrind: string;
  let cap: string;
  let mould1: string;
  let mould2: string;
  let machine1: string;
  let machine2: string;
  let store: string;
  let floor: string;
  let otherFloor: string;
  let finishedGoods: string;
  let scrapYard: string;
  const today = factoryToday();

  const created = async (path: string, body: object, api = owner) =>
    (await api.post(path).send(body).expect(201)).body;
  const id = async (path: string, body: object) =>
    (await created(path, body)).id as string;

  /** A tablet's calls: its device token instead of a user's bearer token. */
  const tablet = (token: string) => ({
    get: (path: string) =>
      request(app.getHttpServer()).get(path).set('X-Device-Token', token),
    post: (path: string) =>
      request(app.getHttpServer()).post(path).set('X-Device-Token', token),
  });
  type Tablet = ReturnType<typeof tablet>;

  const pair = (code: string) =>
    request(app.getHttpServer()).post('/devices/pair').send({ code });
  const pairedTablet = async (floorLocationId = floor) => {
    const { device, pairingCode } = await created('/devices', {
      name: 'Hall A tablet',
      floorLocationId,
    });
    const { deviceToken } = (await pair(pairingCode).expect(200)).body;
    return { device, api: tablet(deviceToken) };
  };
  const setPin = (userId: string, pin: string, api = manager) =>
    api.put(`/users/${userId}/pin`).send({ pin });
  const signIn = (api: Tablet, userId: string, pin: string) =>
    api.post('/sync/sessions').send({ userId, pin });

  const card = async (machineId: string, mouldId: string, floorId = floor) => {
    const planned = await created('/job-cards', {
      productId: cap,
      mouldId,
      machineId,
      floorLocationId: floorId,
      plannedPieces: 10_000,
      plannedStartDate: today,
    });
    await owner.post(`/job-cards/${planned.id}/release`).expect(200);
    return planned as { id: string; number: string };
  };
  const issue = (cardId: string) =>
    owner
      .post(`/job-cards/${cardId}/issues`)
      .send({
        fromLocationId: store,
        lines: [
          { rawMaterialId: pp, kilograms: '20' },
          { rawMaterialId: mb, kilograms: '0.5' },
        ],
      })
      .expect(201);
  const entry = (
    sessionId: string,
    jobCardId: string,
    fields: object = {},
  ) => ({
    id: randomUUID(),
    session_id: sessionId,
    job_card_id: jobCardId,
    shift_date: today,
    shift: 'A',
    operator_id: operatorId,
    shot_start: 0,
    shot_end: 260,
    good_pieces: 1_000,
    rejected_pieces: 40,
    recorded_at: Date.now(),
    ...fields,
  });
  const waste = (
    sessionId: string,
    jobCardId: string,
    fields: object = {},
  ) => ({
    id: randomUUID(),
    session_id: sessionId,
    job_card_id: jobCardId,
    shift_date: today,
    shift: 'A',
    waste_material_id: regrind,
    scrap_location_id: scrapYard,
    runner_grams: 500,
    reject_grams: 0,
    purge_grams: 1_000,
    sweepings_grams: 0,
    recorded_at: Date.now(),
    ...fields,
  });
  const push = async (api: Tablet, changes: object) =>
    (await api.post('/sync/push').send({ changes }).expect(200)).body;
  const pushEntries = (api: Tablet, records: object[]) =>
    push(api, { production_entries: { created: records } });

  beforeEach(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    owner = apiFor(app, await tokenFor(app, OWNER));
    manager = apiFor(app, await tokenFor(app, MANAGER));
    supervisor = apiFor(app, await tokenFor(app, SUPERVISOR));
    storekeeper = apiFor(app, await tokenFor(app, Role.STOREKEEPER));
    operatorId = (await createUser(app, Role.OPERATOR)).id;

    const material = (code: string, type: string) =>
      id('/raw-materials', { code, name: code, type, minimumStockGrams: 0 });
    pp = await material('RM-PP-01', 'RESIN');
    mb = await material('MB-RED-01', 'MASTERBATCH');
    regrind = await material('RG-PP-01', 'REGRIND');
    cap = await id('/products', {
      code: 'CAP-28',
      name: 'Bottle cap 28 mm',
      pieceWeightMg: 2_500,
      colour: 'Red',
      piecesPerCarton: 2_000,
    });
    const formula = await id(`/products/${cap}/formulas`, {
      wasteBasisPoints: 400,
      lines: [
        { rawMaterialId: pp, basisPoints: 9_800 },
        { rawMaterialId: mb, basisPoints: 200 },
      ],
    });
    await owner.post(`/formulas/${formula}/activate`).expect(200);
    const mould = (code: string) =>
      id('/moulds', {
        code,
        name: code,
        cavities: 4,
        cycleTimeTenths: 125,
        runnerWeightMg: 2_000,
        productId: cap,
      });
    mould1 = await mould('M-01');
    mould2 = await mould('M-02');
    const machine = (code: string) =>
      id('/machines', { code, name: code, tonnage: 160 });
    machine1 = await machine('IM-01');
    machine2 = await machine('IM-02');
    const location = (code: string, kind: string) =>
      id('/locations', { code, name: code, kind });
    store = await location('RM-STORE', 'RAW_MATERIAL_STORE');
    floor = await location('FLOOR-A', 'PRODUCTION_FLOOR');
    otherFloor = await location('FLOOR-B', 'PRODUCTION_FLOOR');
    finishedGoods = await location('FG-STORE', 'FINISHED_GOODS_STORE');
    scrapYard = await location('SCRAP', 'SCRAP_YARD');
    await created('/stock/openings', {
      locationId: store,
      lines: [
        { itemType: 'RAW_MATERIAL', itemId: pp, kilograms: '100' },
        { itemType: 'RAW_MATERIAL', itemId: mb, kilograms: '5' },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('devices', () => {
    it('pairs a tablet once with its code, and refuses it once revoked', async () => {
      const registered = await created('/devices', {
        name: 'Hall A tablet',
        floorLocationId: floor,
      });
      pairingCodeResponse.strict().parse(registered);
      expect(registered.device.status).toBe('PAIRING');
      expect(registered.pairingCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);

      // Typed on the tablet in lower case, with a dash.
      const typed = `${registered.pairingCode.slice(0, 4)}-${registered.pairingCode.slice(4)}`;
      const paired = (await pair(typed.toLowerCase()).expect(200)).body;
      pairingResponse.strict().parse(paired);
      expect(
        (await pair(registered.pairingCode).expect(401)).body.message,
      ).toBe('Unknown or expired pairing code');
      const [listed] = (await owner.get('/devices').expect(200)).body;
      expect(listed).toMatchObject({
        status: 'PAIRED',
        pairingExpiresAt: null,
      });
      deviceResponse.strict().parse(listed);

      const api = tablet(paired.deviceToken);
      await api.get('/sync/pull').expect(200);
      expect(
        (await owner.get('/devices').expect(200)).body[0].lastSeenAt,
      ).not.toBeNull();
      await owner.post(`/devices/${listed.id}/revoke`).expect(200);
      await api.get('/sync/pull').expect(401);
      await owner.post(`/devices/${listed.id}/revoke`).expect(409);
      await owner.post(`/devices/${listed.id}/pairing-code`).expect(409);
      await request(app.getHttpServer()).get('/sync/pull').expect(401);
    });

    it('cuts off the old token with a new code, and refuses an expired code', async () => {
      const { device, api } = await pairedTablet();
      const again = (
        await owner.post(`/devices/${device.id}/pairing-code`).expect(200)
      ).body;

      await api.get('/sync/pull').expect(401);
      const { deviceToken } = (await pair(again.pairingCode).expect(200)).body;
      await tablet(deviceToken).get('/sync/pull').expect(200);

      const late = await created('/devices', {
        name: 'Hall B tablet',
        floorLocationId: otherFloor,
      });
      await prisma.device.update({
        where: { id: late.device.id },
        data: { pairingExpiresAt: new Date(Date.now() - 1_000) },
      });
      await pair(late.pairingCode).expect(401);
      expect(
        (await owner.get('/devices').expect(200)).body.find(
          (device: { id: string }) => device.id === late.device.id,
        ).status,
      ).toBe('CODE_EXPIRED');
      await owner
        .post('/devices')
        .send({ name: 'In the store', floorLocationId: store })
        .expect(400);
    });
  });

  describe('PINs', () => {
    it('takes 4 to 6 digits that are not one digit repeated or a straight run', async () => {
      for (const pin of [
        '1111',
        '1234',
        '4321',
        '123456',
        '258',
        '2580461',
        '25a0',
      ]) {
        await setPin(operatorId, pin).expect(400);
      }
      await setPin(operatorId, '2580').expect(204);
      const storekeeperId = (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'storekeeper@example.com' },
        })
      ).id;
      expect(
        (await setPin(storekeeperId, '2580').expect(400)).body.message,
      ).toBe('A STOREKEEPER does not record shifts, so gets no tablet PIN');

      const pins = (await manager.get('/users/pins').expect(200)).body;
      pinsResponse.parse(pins);
      expect(
        pins.map((user: { role: string; hasPin: boolean }) => [
          user.role,
          user.hasPin,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ['OPERATOR', true],
          ['SUPERVISOR', false],
        ]),
      );
      expect(
        pins.some((user: { role: string }) => user.role === 'STOREKEEPER'),
      ).toBe(false);
    });

    it('signs in with a PIN, and locks a user out of one tablet after five wrong ones', async () => {
      await setPin(operatorId, '2580').expect(204);
      const { api } = await pairedTablet();
      const other = await pairedTablet();

      const session = (await signIn(api, operatorId, '2580').expect(201)).body;
      sessionResponse.strict().parse(session);
      expect(session.user).toMatchObject({ id: operatorId, role: 'OPERATOR' });
      expect(
        Date.parse(session.expiresAt) - Date.parse(session.startedAt),
      ).toBe(12 * HOUR);

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        expect(
          (await signIn(api, operatorId, '9999').expect(401)).body.message,
        ).toBe('Wrong PIN');
      }
      expect(
        (await signIn(api, operatorId, '9999').expect(423)).body,
      ).toMatchObject({
        message: 'Too many wrong PINs on this tablet; try again in 15 min',
        retryAfterMinutes: 15,
      });
      await signIn(api, operatorId, '2580').expect(423);
      // Locked on that tablet only.
      await signIn(other.api, operatorId, '2580').expect(201);
      expect(
        (await manager.get('/users/pins').expect(200)).body.find(
          (user: { id: string }) => user.id === operatorId,
        ).lockedUntil,
      ).not.toBeNull();

      await setPin(operatorId, '1357').expect(204);
      await signIn(api, operatorId, '1357').expect(201);
      const supervisorId = (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'supervisor@example.com' },
        })
      ).id;
      await signIn(api, randomUUID(), '1357').expect(401);
      // Without a PIN of their own.
      await signIn(api, supervisorId, '1357').expect(401);
    });
  });

  describe('pull', () => {
    it('sends the floor what it needs, then only what changed since', async () => {
      const inWork = await card(machine1, mould1);
      // Planned, and released on another floor: neither goes to this tablet.
      await created('/job-cards', {
        productId: cap,
        mouldId: mould2,
        machineId: machine2,
        floorLocationId: floor,
        plannedPieces: 100,
        plannedStartDate: today,
      });
      await card(machine2, mould2, otherFloor);
      const retired = await id('/products', {
        code: 'CAP-OLD',
        name: 'Old cap',
        pieceWeightMg: 2_000,
        colour: 'Blue',
        piecesPerCarton: 1_000,
      });
      await owner.post(`/products/${retired}/deactivate`).expect(200);
      const supervisorId = (
        await prisma.user.findUniqueOrThrow({
          where: { email: 'supervisor@example.com' },
        })
      ).id;
      await setPin(operatorId, '2580').expect(204);
      await setPin(supervisorId, '1357').expect(204);
      const { api } = await pairedTablet();
      const ids = (table: { created: { id: string }[] }) =>
        table.created.map((row) => row.id);

      const first = (await api.get('/sync/pull').expect(200)).body;

      pullResponse.strict().parse(first);
      expect(ids(first.changes.job_cards)).toEqual([inWork.id]);
      expect(first.changes.job_cards.created[0]).toMatchObject({
        number: inWork.number,
        cavities: 4,
        product_id: cap,
        machine_id: machine1,
        status: 'RELEASED',
      });
      expect(ids(first.changes.products)).toEqual([cap]);
      expect(ids(first.changes.operators)).toEqual([operatorId]);
      // Everyone who records on tablets and has a PIN; the owner and
      // manager have none here.
      expect(
        first.changes.tablet_users.created.sort(
          (a: { name: string }, b: { name: string }) =>
            a.name.localeCompare(b.name),
        ),
      ).toEqual([
        { id: operatorId, name: 'OPERATOR user', role: 'OPERATOR' },
        { id: supervisorId, name: 'SUPERVISOR user', role: 'SUPERVISOR' },
      ]);
      expect(first.changes.rejections.created).toEqual([]);
      expect(ids(first.changes.raw_materials)).toEqual([regrind]);
      expect(ids(first.changes.locations)).toEqual([scrapYard]);
      expect(ids(first.changes.machines).sort()).toEqual(
        [machine1, machine2].sort(),
      );
      expect(first.changes.job_cards.deleted).toEqual([]);

      await owner.post(`/job-cards/${inWork.id}/close`).expect(200);
      await owner
        .patch(`/machines/${machine2}`)
        .send({ name: 'Haitian MA1600' })
        .expect(200);
      await owner.post(`/users/${operatorId}/deactivate`).expect(200);
      const newRegrind = await id('/raw-materials', {
        code: 'RG-PP-02',
        name: 'PP regrind, red',
        type: 'REGRIND',
        minimumStockGrams: 0,
      });

      const next = (
        await api.get(`/sync/pull?lastPulledAt=${first.timestamp}`).expect(200)
      ).body;

      expect(next.changes.job_cards).toEqual({
        created: [],
        updated: [],
        deleted: [inWork.id],
      });
      expect(next.changes.machines.updated).toEqual([
        {
          id: machine2,
          code: 'IM-02',
          name: 'Haitian MA1600',
          status: 'ACTIVE',
        },
      ]);
      expect(next.changes.operators.deleted).toEqual([operatorId]);
      expect(next.changes.tablet_users).toEqual({
        created: [],
        updated: [],
        deleted: [operatorId],
      });
      expect(
        next.changes.raw_materials.updated.map((m: { id: string }) => m.id),
      ).toEqual([newRegrind]);
      expect(next.changes.products).toEqual({
        created: [],
        updated: [],
        deleted: [],
      });
      expect(next.timestamp).toBeGreaterThanOrEqual(first.timestamp);
      await api.get('/sync/pull?lastPulledAt=null').expect(200);
      await api.get('/sync/pull?lastPulledAt=yesterday').expect(400);
    });
  });

  describe('push', () => {
    let api: Tablet;
    let sessionId: string;
    let running: { id: string; number: string };

    beforeEach(async () => {
      await setPin(operatorId, '2580').expect(204);
      ({ api } = await pairedTablet());
      sessionId = (await signIn(api, operatorId, '2580').expect(201)).body
        .sessionId;
      running = await card(machine1, mould1);
      await issue(running.id);
    });

    it('posts each new entry once, at server time, as whoever signed in', async () => {
      const shift = entry(sessionId, running.id, {
        recorded_at: Date.now() - HOUR,
      });
      const weighed = waste(sessionId, running.id);

      const result = await push(api, {
        production_entries: { created: [shift] },
        waste_entries: { created: [weighed] },
      });

      pushResponse.strict().parse(result);
      expect(result).toEqual({
        accepted: [shift.id, weighed.id],
        rejected: [],
      });
      expect(await pushEntries(api, [shift])).toEqual({
        accepted: [shift.id],
        rejected: [],
      });
      const entries = (
        await owner.get(`/job-cards/${running.id}/entries`).expect(200)
      ).body;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        id: shift.id,
        operatorId,
        recordedById: operatorId,
        goodPieces: 1_000,
      });
      // The ledger moved at server time; the tablet's clock is only noted.
      expect(Date.now() - Date.parse(entries[0].createdAt)).toBeLessThan(
        60_000,
      );
      const synced = await prisma.syncedRecord.findUniqueOrThrow({
        where: { id: shift.id },
      });
      expect(synced).toMatchObject({
        status: 'ACCEPTED',
        sessionId,
        recordedById: operatorId,
        deviceRecordedAt: new Date(shift.recorded_at),
      });
      expect(
        (await owner.get(`/job-cards/${running.id}/waste`).expect(200)).body,
      ).toMatchObject([{ id: weighed.id }]);
      expect(await prisma.productionEntry.count()).toBe(1);
    });

    it('refuses records one by one and keeps why, answering the same way again', async () => {
      await pushEntries(api, [entry(sessionId, running.id)]);
      const closed = await card(machine2, mould2);
      await owner.post(`/job-cards/${closed.id}/close`).expect(200);
      const sameShift = entry(sessionId, running.id);
      const tooMuch = entry(sessionId, running.id, {
        shift: 'B',
        shot_start: 260,
        shot_end: 260_260,
        good_pieces: 1_000_000,
      });
      const onClosedCard = entry(sessionId, closed.id);
      const backwards = entry(sessionId, running.id, {
        shift: 'C',
        shot_start: 300,
        shot_end: 200,
      });
      const fine = entry(sessionId, running.id, {
        shift: 'C',
        shot_start: 260,
        shot_end: 300,
        good_pieces: 160,
        rejected_pieces: 0,
      });
      const records = [sameShift, tooMuch, onClosedCard, backwards, fine];

      const result = await pushEntries(api, records);

      const reasons = {
        [sameShift.id]: `${running.number} already has an entry for shift A on ${today}`,
        [tooMuch.id]: 'Not enough stock for RM-PP-01',
        [onClosedCard.id]: `${closed.number} is CLOSED; material and goods move only while it is RELEASED or RUNNING`,
        [backwards.id]:
          'Invalid record: The shot counter end cannot be before its start',
      };
      expect(result.accepted).toEqual([fine.id]);
      expect(result.rejected).toEqual(
        Object.entries(reasons).map(([recordId, reason]) => ({
          id: recordId,
          table: 'production_entries',
          reason,
        })),
      );
      expect(await pushEntries(api, records)).toEqual(result);
      expect(await prisma.syncedRecord.count()).toBe(6);
      expect(await prisma.productionEntry.count()).toBe(2);

      const listed = (await supervisor.get('/sync/rejections').expect(200))
        .body;
      pageOf(rejectionResponse.strict()).parse(listed);
      expect(listed.total).toBe(4);
      expect(
        listed.items.find((r: { id: string }) => r.id === onClosedCard.id),
      ).toMatchObject({
        kind: 'PRODUCTION_ENTRY',
        status: 'REJECTED',
        deviceName: 'Hall A tablet',
        recordedByName: 'OPERATOR user',
        jobCardNumber: closed.number,
        payload: { good_pieces: 1_000, shift: 'A' },
      });

      const edited = await push(api, {
        production_entries: { updated: [fine], deleted: [sameShift.id] },
      });
      expect(edited.rejected).toEqual([
        {
          id: fine.id,
          table: 'production_entries',
          reason: 'Tablets only add records; correct them in the office',
        },
        {
          id: sameShift.id,
          table: 'production_entries',
          reason: 'Tablets only add records; correct them in the office',
        },
      ]);
      expect(await prisma.syncedRecord.count()).toBe(6);
    });

    it('lets an operator record only their own shift', async () => {
      const other = await createUser(app, Role.OPERATOR, {
        email: 'second.operator@example.com',
      });

      const result = await pushEntries(api, [
        entry(sessionId, running.id, { operator_id: other.id }),
      ]);

      expect(result.rejected[0].reason).toBe(
        'Operators record their own production',
      );
    });

    it('takes a late record only if made during its sign-in and sent within 72 hours', async () => {
      const ended = async (startedHoursAgo: number) =>
        (
          await prisma.deviceSession.update({
            where: {
              id: (await signIn(api, operatorId, '2580').expect(201)).body
                .sessionId,
            },
            data: {
              startedAt: new Date(Date.now() - startedHoursAgo * HOUR),
              expiresAt: new Date(Date.now() - (startedHoursAgo - 12) * HOUR),
            },
          })
        ).id;
      const yesterday = await ended(20);
      const days = await ended(80);
      const hoursAgo = (hours: number) => Date.now() - hours * HOUR;
      const inTime = entry(yesterday, running.id, {
        shift_date: addDays(today, -1),
        recorded_at: hoursAgo(10),
      });
      const afterSignIn = entry(yesterday, running.id, {
        shift_date: addDays(today, -2),
        recorded_at: hoursAgo(5),
      });
      const tooLate = entry(days, running.id, {
        shift_date: addDays(today, -3),
        recorded_at: hoursAgo(75),
      });
      const unknown = entry(randomUUID(), running.id, {
        shift_date: addDays(today, -4),
      });

      const result = await pushEntries(api, [
        inTime,
        afterSignIn,
        tooLate,
        unknown,
      ]);

      expect(result.accepted).toEqual([inTime.id]);
      expect(result.rejected.map((r: { reason: string }) => r.reason)).toEqual([
        'Recorded outside the sign-in it names',
        'Arrived more than 72 hours after it was recorded',
        'Not signed in on this tablet',
      ]);
      // Another tablet's sign-in doesn't count here either.
      const other = await pairedTablet();
      expect(
        (await pushEntries(other.api, [entry(sessionId, running.id)]))
          .rejected[0].reason,
      ).toBe('Not signed in on this tablet');
    });

    it('refuses the records of someone deactivated since', async () => {
      await owner.post(`/users/${operatorId}/deactivate`).expect(200);

      const result = await pushEntries(api, [entry(sessionId, running.id)]);

      expect(result.rejected[0].reason).toBe(
        'OPERATOR user can no longer record on tablets',
      );
    });

    it('sends a tablet its refused records until a supervisor reviews them', async () => {
      const closed = await card(machine2, mould2);
      await owner.post(`/job-cards/${closed.id}/close`).expect(200);
      const refused = entry(sessionId, closed.id);
      const before = (await api.get('/sync/pull').expect(200)).body;
      await pushEntries(api, [refused, entry(sessionId, running.id)]);

      const after = (
        await api.get(`/sync/pull?lastPulledAt=${before.timestamp}`).expect(200)
      ).body;

      expect(after.changes.rejections).toEqual({
        created: [],
        updated: [
          {
            id: refused.id,
            kind: 'PRODUCTION_ENTRY',
            job_card_id: closed.id,
            job_card_number: closed.number,
            reason: `${closed.number} is CLOSED; material and goods move only while it is RELEASED or RUNNING`,
            recorded_at: refused.recorded_at,
          },
        ],
        deleted: [],
      });
      const other = await pairedTablet();
      expect(
        (await other.api.get('/sync/pull').expect(200)).body.changes.rejections
          .created,
      ).toEqual([]);

      await supervisor
        .post(`/sync/rejections/${refused.id}/dismiss`)
        .send({ note: 'Made on the wrong card' })
        .expect(204);
      const reviewed = (
        await api.get(`/sync/pull?lastPulledAt=${after.timestamp}`).expect(200)
      ).body;
      expect(reviewed.changes.rejections.deleted).toEqual([refused.id]);
    });

    it('lets a supervisor resolve or dismiss a refused record, once', async () => {
      const closed = await card(machine2, mould2);
      await owner.post(`/job-cards/${closed.id}/close`).expect(200);
      const [first, second] = [
        entry(sessionId, closed.id),
        entry(sessionId, closed.id, { shift: 'B' }),
      ];
      await pushEntries(api, [first, second]);
      const note = { note: 'Recorded on JC in the office' };

      await supervisor
        .post(`/sync/rejections/${first.id}/resolve`)
        .send(note)
        .expect(204);
      await supervisor
        .post(`/sync/rejections/${first.id}/dismiss`)
        .send(note)
        .expect(409);
      await manager
        .post(`/sync/rejections/${second.id}/dismiss`)
        .send({ note: 'Made twice' })
        .expect(204);
      await supervisor
        .post(`/sync/rejections/${randomUUID()}/resolve`)
        .send(note)
        .expect(404);
      await supervisor
        .post(`/sync/rejections/${second.id}/resolve`)
        .send({ note: ' ' })
        .expect(400);

      const status = async (filter: string) =>
        (await supervisor.get(`/sync/rejections?${filter}`).expect(200)).body
          .items;
      expect(await status('status=REJECTED')).toEqual([]);
      expect(await status('status=RESOLVED')).toMatchObject([
        {
          id: first.id,
          reviewedByName: 'SUPERVISOR user',
          reviewNote: 'Recorded on JC in the office',
        },
      ]);
      expect(await status('status=DISMISSED')).toMatchObject([
        { id: second.id, reviewedByName: 'MANAGER user' },
      ]);
      expect(await status('')).toHaveLength(2);
    });

    it('keeps every ledger sum equal to its balance and writes outbox events', async () => {
      await push(api, {
        production_entries: { created: [entry(sessionId, running.id)] },
        waste_entries: { created: [waste(sessionId, running.id)] },
      });
      await pushEntries(api, [
        entry(sessionId, running.id, { good_pieces: 1_000_000, shift: 'B' }),
      ]);

      const mismatches = await prisma.$queryRaw<unknown[]>`
        SELECT b.item_type, b.item_id, b.location_id
        FROM stock_balances b
        FULL JOIN (
          SELECT item_type, item_id, location_id,
                 SUM(grams)::bigint AS grams,
                 SUM(COALESCE(pieces, 0))::bigint AS pieces
          FROM stock_ledger
          GROUP BY item_type, item_id, location_id
        ) l USING (item_type, item_id, location_id)
        WHERE b.grams IS DISTINCT FROM COALESCE(l.grams, 0)
           OR b.pieces IS DISTINCT FROM COALESCE(l.pieces, 0)`;
      expect(mismatches).toEqual([]);
      const types = (await prisma.outboxEvent.findMany()).map(
        (event) => event.type,
      );
      expect(types).toEqual(
        expect.arrayContaining([
          'device.registered',
          'device.paired',
          'production.entry_recorded',
          'production.waste_recorded',
          'sync.record_rejected',
        ]),
      );
    });
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const { device } = await pairedTablet();
    const api =
      role === OWNER
        ? owner
        : role === MANAGER
          ? manager
          : role === SUPERVISOR
            ? supervisor
            : role === Role.STOREKEEPER
              ? storekeeper
              : role === Role.OPERATOR
                ? apiFor(
                    app,
                    (await logIn(app, 'operator@example.com')).accessToken,
                  )
                : apiFor(app, await tokenFor(app, role));
    const allowed = (roles: Role[], ok: number) =>
      roles.includes(role) ? ok : 403;

    await api.get('/devices').expect(allowed(ACCESS.devices, 200));
    await api
      .post('/devices')
      .send({ name: 'Spare tablet', floorLocationId: floor })
      .expect(allowed(ACCESS.devices, 201));
    await api
      .post(`/devices/${device.id}/pairing-code`)
      .expect(allowed(ACCESS.devices, 200));
    await api.get('/users/pins').expect(allowed(ACCESS.pins, 200));
    await setPin(operatorId, '2580', api).expect(allowed(ACCESS.pins, 204));
    await api.get('/sync/rejections').expect(allowed(ACCESS.rejections, 200));
    // A user's token is no device token.
    await api.get('/sync/pull').expect(401);
  });

  it('answers the tablet routes only with a device token', async () => {
    const response = await owner.get('/sync/pull').expect(401);
    expect(response.body.message).toBe('Pair this tablet first');
    await tablet('not-a-token').get('/sync/pull').expect(401);
    await tablet('not-a-token')
      .post('/sync/push')
      .send({ changes: {} })
      .expect(401);
  });
});
