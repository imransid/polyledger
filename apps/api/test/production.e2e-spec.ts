import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { factoryToday } from '../src/common/dates.js';
import { pageOf } from '../src/common/list-query.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import {
  closedJobCardResponse,
  entryResponse,
  entryWithWarningsResponse,
  issueSuggestionResponse,
  jobCardDetailsResponse,
  jobCardResponse,
  machineBoardResponse,
  summaryResponse,
  wasteEntryResponse,
} from '../src/production/responses.js';
import { postedDocumentResponse } from '../src/stock/responses.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

const { OWNER, MANAGER, SUPERVISOR, STOREKEEPER, OPERATOR } = Role;

// Who may do what, written out here rather than imported from the code, so a
// wrong role list in the code fails this test instead of agreeing with it.
const ACCESS = {
  readJobCards: [OWNER, MANAGER, SUPERVISOR, STOREKEEPER, OPERATOR],
  readSummary: [OWNER, MANAGER, SUPERVISOR, STOREKEEPER],
  planJobCards: [OWNER, MANAGER],
  startAndStop: [OWNER, MANAGER, SUPERVISOR],
  moveMaterialAndGoods: [OWNER, MANAGER, STOREKEEPER],
  recordEntries: [OWNER, MANAGER, SUPERVISOR, OPERATOR],
  reverseEntries: [OWNER, MANAGER, SUPERVISOR],
};

describe('production', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Api;
  let supervisor: Api;
  let operator: Api;
  let storekeeper: Api;
  let operatorId: string;
  let pp: string;
  let mb: string;
  let cap: string;
  let mould1: string;
  let mould2: string;
  let machine1: string;
  let machine2: string;
  let store: string;
  let floor: string;
  let finishedGoods: string;
  let salesOrder: string;

  const created = async (path: string, body: object, api = owner) =>
    (await api.post(path).send(body).expect(201)).body.id as string;

  const jobCard = (overrides: object = {}) =>
    owner.post('/job-cards').send({
      productId: cap,
      mouldId: mould1,
      machineId: machine1,
      floorLocationId: floor,
      plannedPieces: 10_000,
      plannedStartDate: '2026-10-15',
      ...overrides,
    });
  const createCard = async (overrides: object = {}) =>
    (await jobCard(overrides).expect(201)).body;
  const act = (id: string, action: string, api = owner, body: object = {}) =>
    api.post(`/job-cards/${id}/${action}`).send(body);
  const releasedCard = async (overrides: object = {}) => {
    const card = await createCard(overrides);
    await act(card.id, 'release').expect(200);
    return card;
  };
  const runningCard = async (overrides: object = {}) => {
    const card = await releasedCard(overrides);
    await act(card.id, 'start', supervisor).expect(200);
    return card;
  };

  const issue = (id: string, lines: [string, string][], api = storekeeper) =>
    api.post(`/job-cards/${id}/issues`).send({
      fromLocationId: store,
      lines: lines.map(([rawMaterialId, kilograms]) => ({
        rawMaterialId,
        kilograms,
      })),
    });
  const issueEnough = (id: string) =>
    issue(id, [
      [pp, '20'],
      [mb, '0.5'],
    ]).expect(201);
  const giveBack = (id: string, lines: [string, string][]) =>
    storekeeper.post(`/job-cards/${id}/returns`).send({
      toLocationId: store,
      lines: lines.map(([rawMaterialId, kilograms]) => ({
        rawMaterialId,
        kilograms,
      })),
    });
  const record = (id: string, entry: object = {}, api = operator) =>
    api.post(`/job-cards/${id}/entries`).send({
      shiftDate: '2026-10-15',
      shift: 'A',
      operatorId,
      shotStart: 0,
      shotEnd: 260,
      goodPieces: 1_000,
      rejectedPieces: 40,
      ...entry,
    });
  const reverseEntry = (cardId: string, entryId: string, api = supervisor) =>
    api
      .post(`/job-cards/${cardId}/entries/${entryId}/reverse`)
      .send({ reason: 'Wrong counter reading' });
  const handOver = (id: string, pieces: number, api = storekeeper) =>
    api
      .post(`/job-cards/${id}/handovers`)
      .send({ toLocationId: finishedGoods, pieces });

  const balance = async (itemId: string, locationId: string) =>
    (
      await owner
        .get(`/stock/balances?itemId=${itemId}&locationId=${locationId}`)
        .expect(200)
    ).body.items[0] ?? { grams: 0, pieces: 0 };

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
    machine1 = await created('/machines', {
      code: 'IM-01',
      name: 'IM-01',
      tonnage: 160,
    });
    machine2 = await created('/machines', {
      code: 'IM-02',
      name: 'IM-02',
      tonnage: 160,
    });

    const location = (code: string, kind: string) =>
      created('/locations', { code, name: code, kind });
    store = await location('RM-STORE', 'RAW_MATERIAL_STORE');
    floor = await location('FLOOR', 'PRODUCTION_FLOOR');
    finishedGoods = await location('FG-STORE', 'FINISHED_GOODS_STORE');
    await created('/stock/openings', {
      locationId: store,
      lines: [
        { itemType: 'RAW_MATERIAL', itemId: pp, kilograms: '100' },
        { itemType: 'RAW_MATERIAL', itemId: mb, kilograms: '5' },
      ],
    });

    const customer = await created('/customers', {
      code: 'CUST-01',
      name: 'Dhaka Traders',
      phone: '01712345678',
      address: 'Tejgaon',
    });
    salesOrder = await created('/sales-orders', {
      customerId: customer,
      orderDate: '2026-10-14',
      deliveryDate: '2026-10-30',
      lines: [{ productId: cap, pieces: 10_000 }],
    });
    await owner.post(`/sales-orders/${salesOrder}/confirm`).expect(200);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('job cards', () => {
    it('freezes the formula, piece weight, cavities and runner weight', async () => {
      const card = await createCard();
      expect(card).toMatchObject({
        status: 'PLANNED',
        plannedStartDate: '2026-10-15',
        pieceWeightMg: 2_500,
        cavities: 4,
        runnerWeightMg: 2_000,
      });
      expect(card.number).toMatch(/^JC-\d{6}$/);

      const newer = await created(`/products/${cap}/formulas`, {
        wasteBasisPoints: 0,
        lines: [{ rawMaterialId: pp, basisPoints: 10_000 }],
      });
      await owner.post(`/formulas/${newer}/activate`).expect(200);
      await owner
        .patch(`/moulds/${mould1}`)
        .send({ cavities: 2, runnerWeightMg: 3_000 })
        .expect(200);
      await owner
        .patch(`/products/${cap}`)
        .send({ pieceWeightMg: 3_000 })
        .expect(200);

      const after = (await owner.get(`/job-cards/${card.id}`).expect(200)).body;
      expect(after).toMatchObject({
        formulaVersionId: card.formulaVersionId,
        pieceWeightMg: 2_500,
        cavities: 4,
        runnerWeightMg: 2_000,
      });
    });

    it('refuses a mould, machine, floor or sales order that does not fit', async () => {
      const box = await created('/products', {
        code: 'BOX-01',
        name: 'Box',
        pieceWeightMg: 100_000,
        colour: 'Blue',
        piecesPerCarton: 10,
      });
      const boxMould = await created('/moulds', {
        code: 'M-BOX',
        name: 'Box mould',
        cavities: 1,
        cycleTimeTenths: 300,
        productId: box,
      });
      const message = async (overrides: object, status = 400) =>
        (await jobCard(overrides).expect(status)).body.message;

      expect(await message({ mouldId: boxMould })).toBe(
        'That mould does not make CAP-28',
      );
      await owner
        .patch(`/moulds/${mould2}`)
        .send({ status: 'REPAIR' })
        .expect(200);
      expect(await message({ mouldId: mould2 })).toBe('Mould M-02 is REPAIR');
      await owner
        .patch(`/machines/${machine2}`)
        .send({ status: 'RETIRED' })
        .expect(200);
      expect(await message({ machineId: machine2 })).toBe(
        'Machine IM-02 is RETIRED',
      );
      expect(await message({ floorLocationId: store })).toBe(
        'Choose an active production floor',
      );
      expect(
        await message({
          productId: box,
          mouldId: boxMould,
          salesOrderId: salesOrder,
        }),
      ).toMatch(/does not order BOX-01$/);
      expect(await message({ productId: box, mouldId: boxMould }, 409)).toBe(
        'No active formula for BOX-01',
      );
    });

    it('shows the sales order number to everyone who reads the card', async () => {
      const card = await createCard({ salesOrderId: salesOrder });
      const forStock = await createCard({ mouldId: mould2 });
      const number = (
        await owner.get(`/sales-orders/${salesOrder}`).expect(200)
      ).body.number;

      expect(
        (await operator.get(`/job-cards/${card.id}`).expect(200)).body,
      ).toMatchObject({ salesOrderId: salesOrder, salesOrderNumber: number });
      expect(
        (await operator.get(`/job-cards/${forStock.id}`).expect(200)).body
          .salesOrderNumber,
      ).toBeNull();
    });

    it('releasing the first card puts its sales order in production', async () => {
      const first = await createCard({ salesOrderId: salesOrder });
      const second = await createCard({
        salesOrderId: salesOrder,
        mouldId: mould2,
      });
      const orderStatus = async () =>
        (await owner.get(`/sales-orders/${salesOrder}`).expect(200)).body
          .status;

      await act(first.id, 'release').expect(200);
      expect(await orderStatus()).toBe('IN_PRODUCTION');
      await act(second.id, 'release').expect(200);
      expect(await orderStatus()).toBe('IN_PRODUCTION');
    });

    it('cannot release a card whose sales order was cancelled', async () => {
      const card = await createCard({ salesOrderId: salesOrder });
      await owner
        .post(`/sales-orders/${salesOrder}/cancel`)
        .send({ reason: 'Customer withdrew' })
        .expect(200);

      await act(card.id, 'release').expect(409);
      expect(
        (await owner.get(`/job-cards/${card.id}`).expect(200)).body.status,
      ).toBe('PLANNED');
    });

    it('runs one card at a time on a machine and on a mould', async () => {
      const running = await runningCard();
      const sameMachine = await releasedCard({ mouldId: mould2 });
      const sameMould = await releasedCard({ machineId: machine2 });

      expect(
        (await act(sameMachine.id, 'start', supervisor).expect(409)).body
          .message,
      ).toBe(`Machine IM-01 is already running ${running.number}`);
      expect(
        (await act(sameMould.id, 'start', supervisor).expect(409)).body.message,
      ).toBe(`Mould M-01 is already running ${running.number}`);

      await act(running.id, 'stop', supervisor).expect(200);
      await act(sameMachine.id, 'start', supervisor).expect(200);
    });

    it('lets only one of two simultaneous starts on a machine win', async () => {
      const a = await releasedCard({ machineId: machine2, mouldId: mould1 });
      const b = await releasedCard({ machineId: machine2, mouldId: mould2 });

      const responses = await Promise.all([
        act(a.id, 'start', supervisor),
        act(b.id, 'start', supervisor),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it('cancels only while no material is issued', async () => {
      const card = await releasedCard();
      const slip = (await issueEnough(card.id)).body;

      const refused = await act(card.id, 'cancel', owner, {
        reason: 'Not needed',
      }).expect(409);
      expect(refused.body.message).toBe(
        `${card.number} has material issued; reverse its issue slips first`,
      );

      await owner
        .post(`/stock/documents/${slip.id}/reverse`)
        .send({ reason: 'Issued by mistake' })
        .expect(201);
      const cancelled = await act(card.id, 'cancel', owner, {
        reason: 'Not needed',
      }).expect(200);
      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Not needed',
      });
    });
  });

  describe('material', () => {
    it('suggests what the planned pieces need and issues it to the floor', async () => {
      const card = await releasedCard();
      const suggestion = async () =>
        (
          await owner.get(`/job-cards/${card.id}/issue-suggestion`).expect(200)
        ).body.map(
          (line: {
            code: string;
            requiredGrams: number;
            suggestedGrams: number;
          }) => [line.code, line.requiredGrams, line.suggestedGrams],
        );

      // 10,000 x 2.5 g x 1.04 = 26,000 g: 25,480 g PP and 520 g masterbatch.
      expect(await suggestion()).toEqual([
        ['RM-PP-01', 25_480, 25_480],
        ['MB-RED-01', 520, 520],
      ]);

      const slip = (await issueEnough(card.id)).body;

      expect(slip.number).toMatch(/^ISS-\d{6}$/);
      expect(await suggestion()).toEqual([
        ['RM-PP-01', 25_480, 5_480],
        ['MB-RED-01', 520, 20],
      ]);
      expect((await balance(pp, floor)).grams).toBe(20_000);
      expect((await balance(pp, store)).grams).toBe(80_000);
    });

    it('issues only formula materials, from a raw material store, to a card in work', async () => {
      const planned = await createCard();
      await issue(planned.id, [[pp, '1']]).expect(409);

      const card = await releasedCard({ mouldId: mould2 });
      const other = await created('/raw-materials', {
        code: 'RM-HD-01',
        name: 'HDPE',
        type: 'RESIN',
        minimumStockGrams: 0,
      });
      const notInFormula = await issue(card.id, [[other, '1']]).expect(400);
      expect(notInFormula.body.message).toBe(
        "Only materials in the job card's formula can be issued",
      );
      await storekeeper
        .post(`/job-cards/${card.id}/issues`)
        .send({
          fromLocationId: floor,
          lines: [{ rawMaterialId: pp, kilograms: '1' }],
        })
        .expect(400);
    });

    it('returns unused material to the store', async () => {
      const card = await releasedCard();
      await issueEnough(card.id);

      const slip = (await giveBack(card.id, [[pp, '2']]).expect(201)).body;

      expect(slip.number).toMatch(/^RET-\d{6}$/);
      expect((await balance(pp, floor)).grams).toBe(18_000);
      expect((await balance(pp, store)).grams).toBe(82_000);
    });
  });

  describe('production entries', () => {
    it('backflushes pieces and runners and puts the good pieces on the floor', async () => {
      const card = await runningCard();
      await issueEnough(card.id);

      const entry = (await record(card.id).expect(201)).body;

      // Pieces: 1,040 x 2.5 g = 2,600 g. Runners: 260 shots x 2 g = 520 g.
      expect(entry.warnings).toEqual([]);
      expect(entry.shiftDate).toBe('2026-10-15');
      expect(entry.materials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rawMaterialId: pp,
            pieceGrams: 2_548,
            runnerGrams: 510,
          }),
          expect.objectContaining({
            rawMaterialId: mb,
            pieceGrams: 52,
            runnerGrams: 10,
          }),
        ]),
      );
      expect((await balance(pp, floor)).grams).toBe(20_000 - 3_058);
      expect((await balance(mb, floor)).grams).toBe(500 - 62);
      expect((await balance(cap, floor)).pieces).toBe(1_000);
      const document = await prisma.stockDocument.findUniqueOrThrow({
        where: { id: entry.stockDocumentId },
      });
      expect(document.number).toMatch(/^PRD-\d{6}$/);
    });

    it('warns, but records, when counts disagree or the shot counter jumps', async () => {
      const card = await runningCard();
      await issueEnough(card.id);
      await record(card.id).expect(201);

      const second = await record(card.id, {
        shift: 'B',
        shotStart: 300,
        shotEnd: 550,
        goodPieces: 900,
        rejectedPieces: 0,
      }).expect(201);

      expect(second.body.warnings).toEqual([
        'Good + rejected is 900 pieces, but shots x cavities is 1000',
        'Shot counter starts at 300, but the previous entry on this machine ended at 260',
      ]);
      // The list shows the same warnings later, for the supervisor.
      const listed = (
        await supervisor.get(`/job-cards/${card.id}/entries`).expect(200)
      ).body;
      expect(
        listed.map((entry: { warnings: string[] }) => entry.warnings),
      ).toEqual([[], second.body.warnings]);
    });

    it('cannot consume more than is on the floor', async () => {
      const card = await runningCard();
      await issue(card.id, [
        [pp, '2'],
        [mb, '0.5'],
      ]).expect(201);

      const response = await record(card.id).expect(409);

      expect(response.body.message).toBe('Not enough stock for RM-PP-01');
      expect((await balance(pp, floor)).grams).toBe(2_000);
      expect(await prisma.productionEntry.count()).toBe(0);
    });

    it('takes one entry per card, shift date and shift until it is reversed', async () => {
      const card = await runningCard();
      await issueEnough(card.id);
      const first = (await record(card.id).expect(201)).body;

      const again = await record(card.id).expect(409);
      expect(again.body.message).toBe(
        `${card.number} already has an entry for shift A on 2026-10-15`,
      );
      await record(card.id, { shift: 'C' }).expect(201);

      await reverseEntry(card.id, first.id).expect(201);
      await record(card.id).expect(201);
    });

    it('records concurrent entries one after the other, never overdrawing the floor', async () => {
      const card = await runningCard();
      await issue(card.id, [
        [pp, '4'],
        [mb, '0.5'],
      ]).expect(201);

      const responses = await Promise.all([
        record(card.id, { shift: 'A' }),
        record(card.id, { shift: 'B' }),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await balance(pp, floor)).grams).toBe(4_000 - 3_058);
    });

    it('lets operators record only their own entries, and others record for any operator', async () => {
      const card = await runningCard();
      await issueEnough(card.id);
      const supervisorUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'supervisor@example.com' },
      });
      const storekeeperUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'storekeeper@example.com' },
      });
      const manager = apiFor(app, await tokenFor(app, Role.MANAGER));
      const managerUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'manager@example.com' },
      });

      await record(card.id, { operatorId: supervisorUser.id }).expect(403);
      await record(
        card.id,
        { operatorId: storekeeperUser.id },
        supervisor,
      ).expect(400);
      await record(card.id, { shift: 'A' }, supervisor).expect(201);
      await record(card.id, { shift: 'B' }, owner).expect(201);
      const byManager = await record(card.id, { shift: 'C' }, manager).expect(
        201,
      );

      expect(byManager.body).toMatchObject({
        operatorId,
        recordedById: managerUser.id,
      });
    });

    it('reverses an entry: material back, pieces off the floor', async () => {
      const card = await runningCard();
      await issueEnough(card.id);
      const entry = (await record(card.id).expect(201)).body;

      await reverseEntry(card.id, entry.id, operator).expect(403);
      await reverseEntry(card.id, entry.id).expect(201);

      expect((await balance(pp, floor)).grams).toBe(20_000);
      expect((await balance(cap, floor)).pieces ?? 0).toBe(0);
      await reverseEntry(card.id, entry.id).expect(409);
      const generic = await owner
        .post(`/stock/documents/${entry.stockDocumentId}/reverse`)
        .send({ reason: 'Try' })
        .expect(409);
      expect(generic.body.message).toBe(
        'Production entries are reversed from their job card',
      );
    });

    it('will not reverse an entry whose pieces were already handed over', async () => {
      const card = await runningCard();
      await issueEnough(card.id);
      const entry = (await record(card.id).expect(201)).body;
      await handOver(card.id, 600).expect(201);

      const response = await reverseEntry(card.id, entry.id).expect(409);

      expect(response.body.message).toBe(
        `${card.number} has only 400 good pieces left on the floor`,
      );
    });
  });

  describe('handover and closing', () => {
    it('hands over only what this card produced', async () => {
      const a = await runningCard();
      const b = await runningCard({ machineId: machine2, mouldId: mould2 });
      await issueEnough(a.id);
      await issueEnough(b.id);
      await record(a.id).expect(201);
      await record(b.id, {
        goodPieces: 500,
        rejectedPieces: 0,
        shotEnd: 125,
      }).expect(201);

      const tooMany = await handOver(a.id, 1_200).expect(409);
      expect(tooMany.body.message).toBe(
        `${a.number} has only 1000 good pieces on the floor`,
      );

      const slip = (await handOver(a.id, 1_000).expect(201)).body;
      expect(slip.number).toMatch(/^FGH-\d{6}$/);
      expect((await balance(cap, finishedGoods)).pieces).toBe(1_000);
      expect((await balance(cap, floor)).pieces).toBe(500);
    });

    it('closes only once the good pieces have left the floor, with a summary', async () => {
      const card = await runningCard();
      await issueEnough(card.id);
      await record(card.id).expect(201);
      const reversed = (
        await record(card.id, {
          shift: 'B',
          shotStart: 260,
          shotEnd: 520,
        }).expect(201)
      ).body;
      await reverseEntry(card.id, reversed.id).expect(201);
      await giveBack(card.id, [[pp, '2']]).expect(201);

      const blocked = await act(card.id, 'close').expect(409);
      expect(blocked.body.message).toBe(
        `${card.number} still has 1000 good pieces on the floor; hand them over first`,
      );

      await handOver(card.id, 1_000).expect(201);
      const closed = (await act(card.id, 'close').expect(200)).body;

      expect(closed.status).toBe('CLOSED');
      expect(Date.now() - Date.parse(closed.closedAt)).toBeLessThan(60_000);
      expect(closed.summary).toEqual({
        plannedPieces: 10_000,
        goodPieces: 1_000,
        rejectedPieces: 40,
        piecesOnFloor: 0,
        // 40 of 1,040 pieces made = 3.85%.
        rejectBasisPoints: 385,
        materials: [
          {
            rawMaterialId: mb,
            code: 'MB-RED-01',
            name: 'MB-RED-01',
            issuedGrams: 500,
            usedForPiecesGrams: 52,
            usedForRunnersGrams: 10,
            usedForPurgeAndSweepingsGrams: 0,
            returnedGrams: 0,
            differenceGrams: 438,
          },
          {
            rawMaterialId: pp,
            code: 'RM-PP-01',
            name: 'RM-PP-01',
            issuedGrams: 20_000,
            usedForPiecesGrams: 2_548,
            usedForRunnersGrams: 510,
            usedForPurgeAndSweepingsGrams: 0,
            returnedGrams: 2_000,
            differenceGrams: 14_942,
          },
        ],
        // No waste weighed yet: 40 rejects x 2.5 g and 520 g of runners.
        waste: {
          expectedRejectAndRunnerGrams: 620,
          weighedRejectAndRunnerGrams: 0,
          differenceGrams: 620,
        },
      });
      expect(
        (await owner.get(`/job-cards/${card.id}/summary`).expect(200)).body,
      ).toEqual(closed.summary);
    });
  });

  describe('for the office screens', () => {
    it('filters job cards by planned date and counts the pieces still on the floor', async () => {
      const card = await runningCard({ plannedStartDate: '2026-10-20' });
      await createCard({ mouldId: mould2, plannedStartDate: '2026-10-25' });
      await issueEnough(card.id);
      await record(card.id).expect(201);
      await handOver(card.id, 400).expect(201);

      const planned = (
        await owner
          .get('/job-cards?plannedFrom=2026-10-19&plannedTo=2026-10-21')
          .expect(200)
      ).body;
      expect(planned.items.map((c: { id: string }) => c.id)).toEqual([card.id]);
      const summary = (
        await owner.get(`/job-cards/${card.id}/summary`).expect(200)
      ).body;
      expect(summary.piecesOnFloor).toBe(600);
    });

    it('lists the stock documents of one job card', async () => {
      const card = await runningCard();
      await issueEnough(card.id);
      await record(card.id).expect(201);
      await createCard({ mouldId: mould2 });

      const documents = (
        await owner.get(`/stock/documents?jobCardId=${card.id}`).expect(200)
      ).body;
      expect(
        documents.items
          .map((document: { kind: string }) => document.kind)
          .sort(),
      ).toEqual(['ISSUE', 'PRODUCTION']);
    });

    it("shows each machine: running, idle or in repair, with today's pieces", async () => {
      const today = factoryToday();
      const running = await runningCard({ plannedStartDate: today });
      await issueEnough(running.id);
      await record(running.id, { shiftDate: today }).expect(201);
      const repair = await created('/machines', {
        code: 'IM-03',
        name: 'IM-03',
        tonnage: 250,
      });
      await owner
        .patch(`/machines/${repair}`)
        .send({ status: 'REPAIR' })
        .expect(200);
      const retired = await created('/machines', {
        code: 'IM-04',
        name: 'IM-04',
        tonnage: 250,
      });
      await owner
        .patch(`/machines/${retired}`)
        .send({ status: 'RETIRED' })
        .expect(200);

      const board = (
        await supervisor.get('/production/machine-board').expect(200)
      ).body;

      expect(board).toEqual([
        {
          machineId: machine1,
          code: 'IM-01',
          name: 'IM-01',
          state: 'RUNNING',
          jobCard: {
            id: running.id,
            number: running.number,
            productId: cap,
            productCode: 'CAP-28',
          },
          goodPiecesToday: 1_000,
          rejectedPiecesToday: 40,
          rejectBasisPointsToday: 385,
        },
        {
          machineId: machine2,
          code: 'IM-02',
          name: 'IM-02',
          state: 'IDLE',
          jobCard: null,
          goodPiecesToday: 0,
          rejectedPiecesToday: 0,
          rejectBasisPointsToday: null,
        },
        expect.objectContaining({ code: 'IM-03', state: 'REPAIR' }),
      ]);
      machineBoardResponse.parse(board);
    });

    it('answers in the shapes the OpenAPI spec promises', async () => {
      const card = await runningCard();
      const read = async (path: string) =>
        (await owner.get(path).expect(200)).body;
      const slip = (await issueEnough(card.id)).body;
      const entry = (await record(card.id).expect(201)).body;

      jobCardResponse.strict().parse(card);
      pageOf(jobCardResponse.strict()).parse(await read('/job-cards'));
      jobCardDetailsResponse
        .strict()
        .parse(await read(`/job-cards/${card.id}`));
      summaryResponse
        .strict()
        .parse(await read(`/job-cards/${card.id}/summary`));
      issueSuggestionResponse.parse(
        await read(`/job-cards/${card.id}/issue-suggestion`),
      );
      entryWithWarningsResponse.strict().parse(entry);
      z.array(entryWithWarningsResponse.strict()).parse(
        await read(`/job-cards/${card.id}/entries`),
      );
      z.array(wasteEntryResponse.strict()).parse(
        await read(`/job-cards/${card.id}/waste`),
      );
      postedDocumentResponse.strict().parse(slip);
      entryResponse
        .strict()
        .parse((await reverseEntry(card.id, entry.id).expect(201)).body);
      await giveBack(card.id, [
        [pp, '20'],
        [mb, '0.5'],
      ]).expect(201);
      closedJobCardResponse
        .strict()
        .parse((await act(card.id, 'close').expect(200)).body);
    });
  });

  it('records the same entry once when it is sent twice', async () => {
    const card = await runningCard();
    await issueEnough(card.id);
    const send = () => record(card.id).set('Idempotency-Key', 'jc-shift-a');

    const first = await send().expect(201);
    const second = await send().expect(201);

    expect(second.body).toEqual(first.body);
    expect(await prisma.productionEntry.count()).toBe(1);
    expect(
      await prisma.stockDocument.count({ where: { kind: 'PRODUCTION' } }),
    ).toBe(1);
  });

  it('writes outbox events for job cards, slips and entries', async () => {
    const card = await runningCard({ salesOrderId: salesOrder });
    await issueEnough(card.id);
    await record(card.id).expect(201);

    const types = (
      await prisma.outboxEvent.findMany({ orderBy: { occurredAt: 'asc' } })
    ).map((event) => event.type);

    expect(types).toEqual(
      expect.arrayContaining([
        'job_card.created',
        'job_card.released',
        'sales_order.in_production',
        'job_card.started',
        'stock.issue.posted',
        'stock.production.posted',
        'production.entry_recorded',
      ]),
    );
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const working = await runningCard();
    await issueEnough(working.id);
    const toReverse = (await record(working.id, { shift: 'A' }).expect(201))
      .body;
    await record(working.id, { shift: 'C' }).expect(201);
    const planned = await createCard({ mouldId: mould2 });
    const toStart = await releasedCard({
      machineId: machine2,
      mouldId: mould2,
    });
    const toClose = await releasedCard({ machineId: machine2 });

    const api =
      role === Role.OWNER
        ? owner
        : role === Role.SUPERVISOR
          ? supervisor
          : role === Role.OPERATOR
            ? operator
            : role === Role.STOREKEEPER
              ? storekeeper
              : apiFor(app, await tokenFor(app, role));
    const allowed = (roles: Role[], ok: number) =>
      roles.includes(role) ? ok : 403;
    const {
      readJobCards,
      readSummary,
      planJobCards,
      startAndStop,
      moveMaterialAndGoods,
      recordEntries,
      reverseEntries,
    } = ACCESS;

    await api.get('/job-cards').expect(allowed(readJobCards, 200));
    await api
      .get(`/job-cards/${working.id}`)
      .expect(allowed(readJobCards, 200));
    await api
      .get(`/job-cards/${working.id}/summary`)
      .expect(allowed(readSummary, 200));
    await api
      .post('/job-cards')
      .send({
        productId: cap,
        mouldId: mould2,
        machineId: machine2,
        floorLocationId: floor,
        plannedPieces: 100,
        plannedStartDate: '2026-10-20',
      })
      .expect(allowed(planJobCards, 201));
    await act(planned.id, 'release', api).expect(allowed(planJobCards, 200));
    await act(toStart.id, 'start', api).expect(allowed(startAndStop, 200));
    await issue(working.id, [[pp, '1']], api).expect(
      allowed(moveMaterialAndGoods, 201),
    );
    await record(working.id, { shift: 'B' }, api).expect(
      allowed(recordEntries, 201),
    );
    await reverseEntry(working.id, toReverse.id, api).expect(
      allowed(reverseEntries, 201),
    );
    await handOver(working.id, 10, api).expect(
      allowed(moveMaterialAndGoods, 201),
    );
    await act(toClose.id, 'close', api).expect(allowed(planJobCards, 200));
  });
});
