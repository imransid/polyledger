import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { wasteReportResponse } from '../src/production/responses.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

const { OWNER, MANAGER, SUPERVISOR, STOREKEEPER, OPERATOR } = Role;

// Written out rather than imported, so a wrong role list in the code fails.
const ACCESS = {
  record: [OWNER, MANAGER, SUPERVISOR, OPERATOR],
  reverse: [OWNER, MANAGER, SUPERVISOR],
  read: [OWNER, MANAGER, SUPERVISOR, STOREKEEPER],
};

describe('waste', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Api;
  let supervisor: Api;
  let operator: Api;
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
  let scrapYard: string;

  const created = async (path: string, body: object, api = owner) =>
    (await api.post(path).send(body).expect(201)).body.id as string;

  const createCard = async (overrides: object = {}) =>
    (
      await owner
        .post('/job-cards')
        .send({
          productId: cap,
          mouldId: mould1,
          machineId: machine1,
          floorLocationId: floor,
          plannedPieces: 10_000,
          plannedStartDate: '2026-10-15',
          ...overrides,
        })
        .expect(201)
    ).body;
  const runningCard = async (overrides: object = {}) => {
    const card = await createCard(overrides);
    await owner.post(`/job-cards/${card.id}/release`).expect(200);
    await supervisor.post(`/job-cards/${card.id}/start`).expect(200);
    return card;
  };
  const issue = (id: string, ppKilograms = '20', mbKilograms = '0.5') =>
    storekeeper
      .post(`/job-cards/${id}/issues`)
      .send({
        fromLocationId: store,
        lines: [
          { rawMaterialId: pp, kilograms: ppKilograms },
          { rawMaterialId: mb, kilograms: mbKilograms },
        ],
      })
      .expect(201);
  const record = (id: string, entry: object = {}) =>
    operator
      .post(`/job-cards/${id}/entries`)
      .send({
        shiftDate: '2026-10-15',
        shift: 'A',
        operatorId,
        shotStart: 0,
        shotEnd: 260,
        goodPieces: 1_000,
        rejectedPieces: 40,
        ...entry,
      })
      .expect(201);
  const recordWaste = (
    id: string,
    lines: [string, string][],
    entry: object = {},
    api = operator,
  ) =>
    api.post(`/job-cards/${id}/waste`).send({
      shiftDate: '2026-10-15',
      shift: 'A',
      wasteMaterialId: regrind,
      scrapLocationId: scrapYard,
      lines: lines.map(([wasteType, kilograms]) => ({ wasteType, kilograms })),
      ...entry,
    });
  const reverseWaste = (cardId: string, entryId: string, api = supervisor) =>
    api
      .post(`/job-cards/${cardId}/waste/${entryId}/reverse`)
      .send({ reason: 'Wrong sack weighed' });
  const wasteReport = (groupBy: string, from = '2026-10-15', to = from) =>
    owner.get(
      `/production/waste-report?groupBy=${groupBy}&from=${from}&to=${to}`,
    );

  const balance = async (itemId: string, locationId: string) =>
    (
      await owner
        .get(`/stock/balances?itemId=${itemId}&locationId=${locationId}`)
        .expect(200)
    ).body.items[0]?.grams ?? 0;

  beforeEach(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
    supervisor = apiFor(app, await tokenFor(app, Role.SUPERVISOR));
    operator = apiFor(app, await tokenFor(app, Role.OPERATOR));
    storekeeper = apiFor(app, await tokenFor(app, Role.STOREKEEPER));
    operatorId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'operator@example.com' },
      })
    ).id;

    const material = (code: string, type: string) =>
      created('/raw-materials', {
        code,
        name: code,
        type,
        minimumStockGrams: 0,
      });
    pp = await material('RM-PP-01', 'RESIN');
    mb = await material('MB-RED-01', 'MASTERBATCH');
    regrind = await material('RG-PP-01', 'REGRIND');
    cap = await created('/products', {
      code: 'CAP-28',
      name: 'Bottle cap 28 mm',
      pieceWeightMg: 2_500,
      colour: 'Red',
      piecesPerCarton: 2_000,
    });
    const formula = await created(`/products/${cap}/formulas`, {
      wasteBasisPoints: 400,
      lines: [
        { rawMaterialId: pp, basisPoints: 9_800 },
        { rawMaterialId: mb, basisPoints: 200 },
      ],
    });
    await owner.post(`/formulas/${formula}/activate`).expect(200);

    const mould = (code: string, runnerWeightMg: number) =>
      created('/moulds', {
        code,
        name: code,
        cavities: 4,
        cycleTimeTenths: 125,
        runnerWeightMg,
        productId: cap,
      });
    mould1 = await mould('M-01', 2_000);
    mould2 = await mould('M-02', 0);
    const machine = (code: string) =>
      created('/machines', { code, name: code, tonnage: 160 });
    machine1 = await machine('IM-01');
    machine2 = await machine('IM-02');

    const location = (code: string, kind: string) =>
      created('/locations', { code, name: code, kind });
    store = await location('RM-STORE', 'RAW_MATERIAL_STORE');
    floor = await location('FLOOR', 'PRODUCTION_FLOOR');
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

  describe('recording', () => {
    it('puts runners and rejects in the scrap yard without touching the floor', async () => {
      const card = await runningCard();
      await issue(card.id);

      const entry = (
        await recordWaste(card.id, [
          ['RUNNER', '0.5'],
          ['REJECT', '0.1'],
        ]).expect(201)
      ).body;

      expect(entry).toMatchObject({
        jobCardId: card.id,
        shiftDate: '2026-10-15',
        shift: 'A',
        reversedAt: null,
      });
      expect(entry.lines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ wasteType: 'RUNNER', grams: 500 }),
          expect.objectContaining({ wasteType: 'REJECT', grams: 100 }),
        ]),
      );
      expect(await balance(regrind, scrapYard)).toBe(600);
      expect(await balance(pp, floor)).toBe(20_000);
      expect(await balance(mb, floor)).toBe(500);
      const document = (
        await owner.get(`/stock/documents/${entry.stockDocumentId}`).expect(200)
      ).body;
      expect(document.number).toMatch(/^WST-\d{6}$/);
    });

    it('takes purge and sweepings off the floor by the frozen formula', async () => {
      const card = await runningCard();
      await issue(card.id);

      await recordWaste(card.id, [
        ['PURGE', '1'],
        ['SWEEPINGS', '0.25'],
      ]).expect(201);

      // 1,250 g split 98% / 2%.
      expect(await balance(pp, floor)).toBe(20_000 - 1_225);
      expect(await balance(mb, floor)).toBe(500 - 25);
      expect(await balance(regrind, scrapYard)).toBe(1_250);
    });

    it('cannot purge more than is on the floor', async () => {
      const card = await runningCard();
      await issue(card.id, '1', '0.01');

      // 1 kg of purge needs 20 g of masterbatch; only 10 g was issued.
      const response = await recordWaste(card.id, [['PURGE', '1']]).expect(409);

      expect(response.body.message).toBe('Not enough stock for MB-RED-01');
      expect(await prisma.wasteEntry.count()).toBe(0);
      expect(await balance(regrind, scrapYard)).toBe(0);
    });

    it('records concurrent purges one after the other, never overdrawing the floor', async () => {
      const card = await runningCard();
      await issue(card.id, '1', '0.02');

      const responses = await Promise.all(
        ['A', 'B'].map((shift) =>
          recordWaste(card.id, [['PURGE', '0.6']], { shift }),
        ),
      );

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await balance(pp, floor)).toBe(1_000 - 588);
      expect(await balance(mb, floor)).toBe(20 - 12);
    });

    it('checks the waste material, the scrap yard, the lines and the job card', async () => {
      const card = await runningCard();
      await issue(card.id);
      const message = async (
        lines: [string, string][],
        entry: object,
        status = 400,
        id = card.id,
      ) => (await recordWaste(id, lines, entry).expect(status)).body.message;

      expect(await message([['RUNNER', '1']], { wasteMaterialId: pp })).toBe(
        'The waste material must be an active REGRIND raw material',
      );
      expect(await message([['RUNNER', '1']], { scrapLocationId: floor })).toBe(
        'Waste must go to an active scrap yard',
      );
      await recordWaste(card.id, [
        ['RUNNER', '1'],
        ['RUNNER', '2'],
      ]).expect(400);
      await recordWaste(card.id, [['RUNNER', '0']]).expect(400);
      await recordWaste(card.id, [['DUST', '1']]).expect(400);

      const planned = await createCard({
        machineId: machine2,
        mouldId: mould2,
      });
      expect(await message([['RUNNER', '1']], {}, 409, planned.id)).toBe(
        `${planned.number} is PLANNED; material and goods move only while it is RELEASED or RUNNING`,
      );
    });
  });

  describe('reversing', () => {
    it('takes one waste entry per card, shift date and shift until it is reversed', async () => {
      const card = await runningCard();
      await issue(card.id);
      const first = (
        await recordWaste(card.id, [
          ['RUNNER', '0.5'],
          ['PURGE', '1'],
        ]).expect(201)
      ).body;

      const duplicate = await recordWaste(card.id, [['RUNNER', '1']]).expect(
        409,
      );
      expect(duplicate.body.message).toBe(
        `${card.number} already has waste for shift A on 2026-10-15`,
      );

      await reverseWaste(card.id, first.id, operator).expect(403);
      const reversed = (await reverseWaste(card.id, first.id).expect(201)).body;
      expect(reversed.reversedAt).not.toBeNull();
      expect(await balance(pp, floor)).toBe(20_000);
      expect(await balance(mb, floor)).toBe(500);
      expect(await balance(regrind, scrapYard)).toBe(0);
      await reverseWaste(card.id, first.id).expect(409);

      await recordWaste(card.id, [['RUNNER', '0.4']]).expect(201);
      const listed = (
        await owner.get(`/job-cards/${card.id}/waste`).expect(200)
      ).body;
      expect(listed.map((entry: { id: string }) => entry.id)).toContain(
        first.id,
      );
      expect(listed).toHaveLength(2);
    });

    it('will not reverse waste whose regrind was already ground', async () => {
      const card = await runningCard();
      await issue(card.id);
      const entry = (
        await recordWaste(card.id, [['RUNNER', '0.5']]).expect(201)
      ).body;
      await storekeeper
        .post('/scrap/grinding')
        .send({
          scrapLocationId: scrapYard,
          storeLocationId: store,
          input: {
            itemType: 'RAW_MATERIAL',
            itemId: regrind,
            kilograms: '0.3',
          },
          outputMaterialId: regrind,
          outputKilograms: '0.29',
        })
        .expect(201);

      const response = await reverseWaste(card.id, entry.id).expect(409);

      expect(response.body.message).toBe('Not enough stock for RG-PP-01');
    });

    it('is not reversed through the generic stock reversal', async () => {
      const card = await runningCard();
      await issue(card.id);
      const entry = (
        await recordWaste(card.id, [['RUNNER', '0.5']]).expect(201)
      ).body;

      const response = await owner
        .post(`/stock/documents/${entry.stockDocumentId}/reverse`)
        .send({ reason: 'Try' })
        .expect(409);

      expect(response.body.message).toBe(
        'Waste entries are reversed from their job card',
      );
    });
  });

  it('adds purge and sweepings, and weighed against expected runners and rejects, to the summary', async () => {
    const card = await runningCard();
    await issue(card.id);
    // 1,040 pieces x 2.5 g = 2,600 g (PP 2,548, MB 52); 260 shots x 2 g of
    // runner = 520 g (PP 510, MB 10).
    await record(card.id);
    // Purge and sweepings: 1,250 g (PP 1,225, MB 25).
    await recordWaste(card.id, [
      ['RUNNER', '0.5'],
      ['REJECT', '0.1'],
      ['PURGE', '1'],
      ['SWEEPINGS', '0.25'],
    ]).expect(201);

    const summary = (
      await owner.get(`/job-cards/${card.id}/summary`).expect(200)
    ).body;

    expect(summary.materials).toEqual([
      expect.objectContaining({
        code: 'MB-RED-01',
        issuedGrams: 500,
        usedForPiecesGrams: 52,
        usedForRunnersGrams: 10,
        usedForPurgeAndSweepingsGrams: 25,
        differenceGrams: 500 - 52 - 10 - 25,
      }),
      expect.objectContaining({
        code: 'RM-PP-01',
        issuedGrams: 20_000,
        usedForPiecesGrams: 2_548,
        usedForRunnersGrams: 510,
        usedForPurgeAndSweepingsGrams: 1_225,
        differenceGrams: 20_000 - 2_548 - 510 - 1_225,
      }),
    ]);
    // 40 rejects x 2.5 g + 520 g of runners expected; 600 g weighed.
    expect(summary.waste).toEqual({
      expectedRejectAndRunnerGrams: 620,
      weighedRejectAndRunnerGrams: 600,
      differenceGrams: 20,
    });
  });

  describe('report', () => {
    beforeEach(async () => {
      // IM-01 / M-01, shift A: 1,040 pieces (2,600 g) and 520 g of runners,
      // plus 1 kg of purge = 4,120 g used; 1,600 g of waste.
      const first = await runningCard();
      await issue(first.id);
      await record(first.id);
      await recordWaste(first.id, [
        ['RUNNER', '0.5'],
        ['REJECT', '0.1'],
        ['PURGE', '1'],
      ]).expect(201);

      // IM-02 / M-02 (hot runner), shift B: 500 pieces = 1,250 g used; 50 g
      // of rejects.
      const second = await runningCard({
        machineId: machine2,
        mouldId: mould2,
      });
      await issue(second.id);
      await record(second.id, {
        shift: 'B',
        shotEnd: 125,
        goodPieces: 480,
        rejectedPieces: 20,
      });
      await recordWaste(second.id, [['REJECT', '0.05']], { shift: 'B' }).expect(
        201,
      );

      // Neither a reversed entry nor another day counts.
      const reversed = (
        await recordWaste(second.id, [['RUNNER', '3']], { shift: 'C' }).expect(
          201,
        )
      ).body;
      await reverseWaste(second.id, reversed.id).expect(201);
      await record(first.id, {
        shiftDate: '2026-10-16',
        shotStart: 260,
        shotEnd: 520,
      });
      await recordWaste(first.id, [['PURGE', '2']], {
        shiftDate: '2026-10-16',
      }).expect(201);
    });

    const first = {
      runnerGrams: 500,
      rejectGrams: 100,
      purgeGrams: 1_000,
      sweepingsGrams: 0,
      wasteGrams: 1_600,
      materialUsedGrams: 4_120,
      // 1,600 / 4,120 = 38.83%
      wasteBasisPoints: 3_883,
    };
    const second = {
      runnerGrams: 0,
      rejectGrams: 50,
      purgeGrams: 0,
      sweepingsGrams: 0,
      wasteGrams: 50,
      materialUsedGrams: 1_250,
      wasteBasisPoints: 400,
    };

    it('reports waste by machine, mould, product and shift', async () => {
      const byMachine = (await wasteReport('machine').expect(200)).body;
      wasteReportResponse.parse(byMachine);
      expect(byMachine).toEqual([
        { key: machine1, label: 'IM-01', ...first },
        { key: machine2, label: 'IM-02', ...second },
      ]);
      expect((await wasteReport('mould').expect(200)).body).toEqual([
        { key: mould1, label: 'M-01', ...first },
        { key: mould2, label: 'M-02', ...second },
      ]);
      expect((await wasteReport('shift').expect(200)).body).toEqual([
        { key: 'A', label: 'A', ...first },
        { key: 'B', label: 'B', ...second },
      ]);
      expect((await wasteReport('product').expect(200)).body).toEqual([
        {
          key: cap,
          label: 'CAP-28',
          runnerGrams: 500,
          rejectGrams: 150,
          purgeGrams: 1_000,
          sweepingsGrams: 0,
          wasteGrams: 1_650,
          materialUsedGrams: 5_370,
          // 1,650 / 5,370 = 30.73%
          wasteBasisPoints: 3_073,
        },
      ]);
    });

    it('covers every shift date from and to', async () => {
      const [machine] = (
        await wasteReport('machine', '2026-10-15', '2026-10-16').expect(200)
      ).body;

      // The second day: another 3,120 g used, plus 2 kg of purge.
      expect(machine).toMatchObject({
        purgeGrams: 3_000,
        wasteGrams: 3_600,
        materialUsedGrams: 4_120 + 3_120 + 2_000,
      });
      expect(
        (await wasteReport('day', '2026-10-15', '2026-10-16').expect(200)).body,
      ).toEqual([
        {
          key: '2026-10-15',
          label: '2026-10-15',
          runnerGrams: 500,
          rejectGrams: 150,
          purgeGrams: 1_000,
          sweepingsGrams: 0,
          wasteGrams: 1_650,
          materialUsedGrams: 5_370,
          wasteBasisPoints: 3_073,
        },
        {
          key: '2026-10-16',
          label: '2026-10-16',
          runnerGrams: 0,
          rejectGrams: 0,
          purgeGrams: 2_000,
          sweepingsGrams: 0,
          wasteGrams: 2_000,
          materialUsedGrams: 3_120 + 2_000,
          // 2,000 / 5,120 = 39.06%
          wasteBasisPoints: 3_906,
        },
      ]);
      await wasteReport('machine', '2026-10-16', '2026-10-15').expect(400);
      await wasteReport('colour').expect(400);
    });
  });

  it('records the same waste once when it is sent twice', async () => {
    const card = await runningCard();
    await issue(card.id);
    const send = () =>
      recordWaste(card.id, [['PURGE', '1']]).set(
        'Idempotency-Key',
        'waste-shift-a',
      );

    const first = await send().expect(201);
    const second = await send().expect(201);

    expect(second.body).toEqual(first.body);
    expect(await prisma.wasteEntry.count()).toBe(1);
    expect(await prisma.stockDocument.count({ where: { kind: 'WASTE' } })).toBe(
      1,
    );
    expect(await balance(pp, floor)).toBe(20_000 - 980);
  });

  it('writes outbox events for waste and its reversal', async () => {
    const card = await runningCard();
    await issue(card.id);
    const entry = (await recordWaste(card.id, [['RUNNER', '0.5']]).expect(201))
      .body;
    await reverseWaste(card.id, entry.id).expect(201);

    const types = (await prisma.outboxEvent.findMany()).map(
      (event) => event.type,
    );

    expect(types).toEqual(
      expect.arrayContaining([
        'stock.waste.posted',
        'production.waste_recorded',
        'stock.reversal.posted',
        'production.waste_reversed',
      ]),
    );
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const card = await runningCard();
    await issue(card.id);
    const toReverse = (
      await recordWaste(card.id, [['RUNNER', '0.5']], {}, owner).expect(201)
    ).body;
    const loggedIn: Partial<Record<Role, Api>> = {
      OWNER: owner,
      SUPERVISOR: supervisor,
      OPERATOR: operator,
      STOREKEEPER: storekeeper,
    };
    const api = loggedIn[role] ?? apiFor(app, await tokenFor(app, role));
    const allowed = (roles: Role[], ok: number) =>
      roles.includes(role) ? ok : 403;

    await recordWaste(card.id, [['RUNNER', '0.5']], { shift: 'B' }, api).expect(
      allowed(ACCESS.record, 201),
    );
    await reverseWaste(card.id, toReverse.id, api).expect(
      allowed(ACCESS.reverse, 201),
    );
    await api
      .get(`/job-cards/${card.id}/waste`)
      .expect(allowed(ACCESS.read, 200));
    await api
      .get(
        '/production/waste-report?groupBy=shift&from=2026-10-15&to=2026-10-15',
      )
      .expect(allowed(ACCESS.read, 200));
  });
});
