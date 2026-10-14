import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { addDays, factoryToday } from '../src/common/dates.js';
import {
  gateQueueResponse,
  leakFiguresResponse,
  orderFiguresResponse,
  stockFiguresResponse,
  todayFiguresResponse,
} from '../src/dashboard/responses.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

const { OWNER, MANAGER } = Role;
const DASHBOARD_PATHS = ['today', 'orders', 'stock', 'leaks', 'gate'];

describe('dashboard', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Api;
  let manager: Api;
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
  let machine3: string;
  let store: string;
  let floor: string;
  let finishedGoods: string;
  let scrapYard: string;
  let customer: string;
  const today = factoryToday();

  const created = async (path: string, body: object, api = owner) =>
    (await api.post(path).send(body).expect(201)).body;

  const runningCard = async (machineId: string, mouldId: string) => {
    const card = await created('/job-cards', {
      productId: cap,
      mouldId,
      machineId,
      floorLocationId: floor,
      plannedPieces: 10_000,
      plannedStartDate: today,
    });
    await owner.post(`/job-cards/${card.id}/release`).expect(200);
    await supervisor.post(`/job-cards/${card.id}/start`).expect(200);
    return card;
  };
  const issue = (cardId: string, ppKilograms: string, mbKilograms: string) =>
    storekeeper
      .post(`/job-cards/${cardId}/issues`)
      .send({
        fromLocationId: store,
        lines: [
          { rawMaterialId: pp, kilograms: ppKilograms },
          { rawMaterialId: mb, kilograms: mbKilograms },
        ],
      })
      .expect(201);
  const record = (cardId: string, entry: object = {}) =>
    operator.post(`/job-cards/${cardId}/entries`).send({
      shiftDate: today,
      shift: 'A',
      operatorId,
      shotStart: 0,
      shotEnd: 260,
      goodPieces: 1_000,
      rejectedPieces: 40,
      ...entry,
    });
  const handOverAndClose = async (cardId: string, pieces: number) => {
    if (pieces > 0) {
      await storekeeper
        .post(`/job-cards/${cardId}/handovers`)
        .send({ toLocationId: finishedGoods, pieces })
        .expect(201);
    }
    await owner.post(`/job-cards/${cardId}/close`).expect(200);
  };
  const order = async (
    deliveryDate: string,
    status: 'DRAFT' | 'CONFIRMED' | 'IN_PRODUCTION' | 'CANCELLED',
  ) => {
    const placed = await created('/sales-orders', {
      customerId: customer,
      orderDate: addDays(today, -30),
      deliveryDate,
      lines: [{ productId: cap, pieces: 100 }],
    });
    const step = (action: string, body: object = {}) =>
      owner.post(`/sales-orders/${placed.id}/${action}`).send(body).expect(200);
    if (status === 'CONFIRMED' || status === 'IN_PRODUCTION') {
      await step('confirm');
    }
    if (status === 'IN_PRODUCTION') {
      await step('start-production');
    }
    if (status === 'CANCELLED') {
      await step('cancel', { reason: 'Customer changed their mind' });
    }
    return placed as { id: string; number: string };
  };
  const location = async (code: string, kind: string) =>
    (await created('/locations', { code, name: code, kind })).id as string;
  const figures = async (path: string) =>
    (await manager.get(`/dashboard/${path}`).expect(200)).body;

  beforeEach(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    owner = apiFor(app, await tokenFor(app, OWNER));
    manager = apiFor(app, await tokenFor(app, MANAGER));
    supervisor = apiFor(app, await tokenFor(app, Role.SUPERVISOR));
    operator = apiFor(app, await tokenFor(app, Role.OPERATOR));
    storekeeper = apiFor(app, await tokenFor(app, Role.STOREKEEPER));
    operatorId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'operator@example.com' },
      })
    ).id;

    const material = async (
      code: string,
      type: string,
      minimumStockGrams: number,
    ) =>
      (
        await created('/raw-materials', {
          code,
          name: code,
          type,
          minimumStockGrams,
        })
      ).id as string;
    // 100 kg in store against a 1,000 kg minimum: low.
    pp = await material('RM-PP-01', 'RESIN', 1_000_000);
    mb = await material('MB-RED-01', 'MASTERBATCH', 0);
    regrind = await material('RG-PP-01', 'REGRIND', 0);
    cap = (
      await created('/products', {
        code: 'CAP-28',
        name: 'Bottle cap 28 mm',
        pieceWeightMg: 2_500,
        colour: 'Red',
        piecesPerCarton: 2_000,
      })
    ).id;
    const formula = await created(`/products/${cap}/formulas`, {
      wasteBasisPoints: 400,
      lines: [
        { rawMaterialId: pp, basisPoints: 9_800 },
        { rawMaterialId: mb, basisPoints: 200 },
      ],
    });
    await owner.post(`/formulas/${formula.id}/activate`).expect(200);
    const mould = async (code: string, runnerWeightMg: number) =>
      (
        await created('/moulds', {
          code,
          name: code,
          cavities: 4,
          cycleTimeTenths: 125,
          runnerWeightMg,
          productId: cap,
        })
      ).id as string;
    mould1 = await mould('M-01', 2_000);
    mould2 = await mould('M-02', 0);
    const machine = async (code: string) =>
      (await created('/machines', { code, name: code, tonnage: 160 }))
        .id as string;
    machine1 = await machine('IM-01');
    machine2 = await machine('IM-02');
    machine3 = await machine('IM-03');
    store = await location('RM-STORE', 'RAW_MATERIAL_STORE');
    floor = await location('FLOOR', 'PRODUCTION_FLOOR');
    finishedGoods = await location('FG-STORE', 'FINISHED_GOODS_STORE');
    scrapYard = await location('SCRAP', 'SCRAP_YARD');
    await created('/stock/openings', {
      locationId: store,
      lines: [
        { itemType: 'RAW_MATERIAL', itemId: pp, kilograms: '100' },
        { itemType: 'RAW_MATERIAL', itemId: mb, kilograms: '5' },
      ],
    });
    customer = (
      await created('/customers', {
        code: 'CUST-01',
        name: 'Dhaka Traders',
        phone: '01712345678',
        address: 'Tejgaon',
      })
    ).id;
  });

  afterEach(async () => {
    await app.close();
  });

  it("counts today's pieces and what each machine is doing", async () => {
    const card = await runningCard(machine1, mould1);
    await issue(card.id, '20', '0.5');
    await record(card.id).expect(201);
    const reversed = (
      await record(card.id, {
        shift: 'B',
        shotStart: 260,
        shotEnd: 520,
      }).expect(201)
    ).body;
    await supervisor
      .post(`/job-cards/${card.id}/entries/${reversed.id}/reverse`)
      .send({ reason: 'Wrong counter reading' })
      .expect(201);
    await record(card.id, {
      shiftDate: addDays(today, -1),
      shotStart: 520,
      shotEnd: 780,
      goodPieces: 500,
      rejectedPieces: 0,
    }).expect(201);
    await owner
      .patch(`/machines/${machine3}`)
      .send({ status: 'REPAIR' })
      .expect(200);

    const day = await figures('today');

    // Only today's entry that stands: yesterday's and the reversed one don't count.
    expect(day).toEqual({
      day: today,
      goodPieces: 1_000,
      rejectedPieces: 40,
      // 40 of 1,040 pieces made = 3.85%.
      rejectBasisPoints: 385,
      machines: { running: 1, idle: 1, repair: 1 },
    });
    todayFiguresResponse.strict().parse(day);
  });

  it('counts open, late and soon-due orders by the factory date', async () => {
    const late = [];
    for (let days = 6; days >= 1; days -= 1) {
      late.push(
        await order(addDays(today, -days), days === 1 ? 'DRAFT' : 'CONFIRMED'),
      );
    }
    await order(addDays(today, -9), 'CANCELLED');
    await order(today, 'CONFIRMED');
    await order(addDays(today, 6), 'IN_PRODUCTION');
    await order(addDays(today, 7), 'CONFIRMED');

    const orders = await figures('orders');

    expect(orders).toEqual({
      today,
      dueBy: addDays(today, 6),
      open: { DRAFT: 1, CONFIRMED: 7, IN_PRODUCTION: 1 },
      lateCount: 6,
      // The five past their delivery date the longest, the oldest first.
      mostLate: late.slice(0, 5).map((lateOrder, index) => ({
        id: lateOrder.id,
        number: lateOrder.number,
        customerCode: 'CUST-01',
        deliveryDate: addDays(today, index - 6),
        daysLate: 6 - index,
      })),
      // Due today and in six days; the seventh day is out.
      dueCount: 2,
    });
    orderFiguresResponse.strict().parse(orders);

    // The lists the card links to hold the same orders.
    const total = async (query: string) =>
      (await owner.get(`/sales-orders?${query}`).expect(200)).body.total;
    expect(await total('open=true')).toBe(9);
    expect(await total('late=true')).toBe(6);
    expect(
      await total(`open=true&deliveryFrom=${today}&deliveryTo=${orders.dueBy}`),
    ).toBe(2);
  });

  it('counts low stock and the finished goods in each store', async () => {
    const otherStore = await location('FG-2', 'FINISHED_GOODS_STORE');
    const retired = await location('FG-OLD', 'FINISHED_GOODS_STORE');
    await owner.post(`/locations/${retired}/deactivate`).expect(200);
    await created('/stock/openings', {
      locationId: finishedGoods,
      lines: [{ itemType: 'PRODUCT', itemId: cap, pieces: 5_000 }],
    });
    await created('/stock/openings', {
      locationId: otherStore,
      lines: [{ itemType: 'PRODUCT', itemId: cap, pieces: 1_200 }],
    });
    await created('/scrap/transfers', {
      fromLocationId: finishedGoods,
      toLocationId: scrapYard,
      reason: 'DAMAGED',
      lines: [{ productId: cap, pieces: 300 }],
    });

    const stock = await figures('stock');

    // Products in the scrap yard are not finished goods; an empty retired
    // store is left out.
    expect(stock).toEqual({
      lowStockCount: 1,
      finishedGoodsPieces: 5_900,
      finishedGoodsStores: [
        { locationId: otherStore, code: 'FG-2', name: 'FG-2', pieces: 1_200 },
        {
          locationId: finishedGoods,
          code: 'FG-STORE',
          name: 'FG-STORE',
          pieces: 4_700,
        },
      ],
    });
    stockFiguresResponse.strict().parse(stock);
  });

  it('adds up the material lost over the last seven days', async () => {
    // Closed eight days ago: outside the seven days, however big.
    const old = await runningCard(machine3, mould1);
    await issue(old.id, '30', '0.5');
    await handOverAndClose(old.id, 0);
    await prisma.jobCard.update({
      where: { id: old.id },
      data: { closedAt: new Date(Date.now() - 8 * 86_400_000) },
    });

    const first = await runningCard(machine1, mould1);
    await issue(first.id, '20', '0.5');
    await record(first.id).expect(201);
    await operator
      .post(`/job-cards/${first.id}/waste`)
      .send({
        shiftDate: today,
        shift: 'A',
        wasteMaterialId: regrind,
        scrapLocationId: scrapYard,
        lines: [
          { wasteType: 'RUNNER', kilograms: '0.5' },
          { wasteType: 'PURGE', kilograms: '1' },
        ],
      })
      .expect(201);
    await handOverAndClose(first.id, 1_000);

    const second = await runningCard(machine2, mould2);
    await issue(second.id, '2', '0.1');
    await record(second.id, {
      shotEnd: 25,
      goodPieces: 100,
      rejectedPieces: 0,
    }).expect(201);
    await handOverAndClose(second.id, 100);

    const supplier = (
      await created('/suppliers', {
        code: 'SUP-01',
        name: 'Bengal Polymer',
        phone: '01712345678',
        address: 'Narayanganj',
      })
    ).id;
    const receive = (receivedOn: string, challan: string, received: string) =>
      created('/stock/receipts', {
        supplierId: supplier,
        supplierReference: `CH-${receivedOn}`,
        receivedOn,
        locationId: store,
        lines: [
          {
            rawMaterialId: pp,
            challanKilograms: challan,
            receivedKilograms: received,
          },
        ],
      });
    await receive(today, '100', '99.5');
    await receive(addDays(today, -10), '50', '49.7');
    await created(
      '/scrap/grinding',
      {
        scrapLocationId: scrapYard,
        storeLocationId: store,
        input: { itemType: 'RAW_MATERIAL', itemId: regrind, kilograms: '0.5' },
        outputMaterialId: regrind,
        outputKilograms: '0.46',
      },
      supervisor,
    );

    const leaks = await figures('leaks');

    const from = addDays(today, -6);
    expect(leaks).toEqual({
      from,
      to: today,
      closedJobCards: 2,
      differenceGrams: 16_380 + 1_850,
      worstJobCards: [
        {
          jobCardId: first.id,
          number: first.number,
          productCode: 'CAP-28',
          // PP: 20,000 issued, 2,548 in pieces, 510 in runners, 980 purged.
          // MB: 500 issued, 52 in pieces, 10 in runners, 20 purged.
          issuedGrams: 20_500,
          differenceGrams: 15_962 + 418,
          // 16,380 of 20,500 g = 79.90%.
          differenceBasisPoints: 7_990,
        },
        {
          jobCardId: second.id,
          number: second.number,
          productCode: 'CAP-28',
          // 100 caps of 2.5 g with no runner: 245 g PP and 5 g MB used.
          issuedGrams: 2_100,
          differenceGrams: 1_755 + 95,
          // 1,850 of 2,100 g = 88.10%.
          differenceBasisPoints: 8_810,
        },
      ],
      wasteByDay: [
        ...[6, 5, 4, 3, 2, 1].map((days) => ({
          day: addDays(today, -days),
          wasteGrams: 0,
          materialUsedGrams: 0,
          wasteBasisPoints: null,
        })),
        {
          day: today,
          wasteGrams: 1_500,
          // Both cards' pieces and runners, 3,120 + 250 g, and the purge.
          materialUsedGrams: 4_370,
          // 1,500 of 4,370 g = 34.32%.
          wasteBasisPoints: 3_432,
        },
      ],
      // Today's 0.5 kg; the receipt ten days ago is out.
      shortageGrams: 500,
      grindingLossGrams: 40,
    });
    leakFiguresResponse.strict().parse(leaks);
  });

  it('lists the challans waiting at the gate, oldest first, flagging a wait over an hour', async () => {
    const confirmed = await order(addDays(today, 10), 'CONFIRMED');
    await created('/stock/openings', {
      locationId: finishedGoods,
      lines: [{ itemType: 'PRODUCT', itemId: cap, pieces: 100 }],
    });
    const challan = (pieces: number) =>
      created(
        '/dispatch/challans',
        {
          orderId: confirmed.id,
          fromLocationId: finishedGoods,
          vehicleNumber: 'DHAKA METRO-TA 11-2345',
          driverName: 'Abdul Karim',
          driverPhone: '01812345678',
          lines: [{ productId: cap, pieces }],
        },
        storekeeper,
      );
    const waiting = await challan(30);
    const fresh = await challan(30);
    const passed = await challan(30);
    await supervisor
      .post(`/dispatch/challans/${passed.id}/gate-pass`)
      .expect(200);
    await prisma.deliveryChallan.update({
      where: { id: waiting.id },
      data: { createdAt: new Date(Date.now() - 2 * 3_600_000) },
    });

    const gate = await figures('gate');

    expect(gate).toEqual([
      {
        id: waiting.id,
        number: waiting.number,
        customerCode: 'CUST-01',
        vehicleNumber: 'DHAKA METRO-TA 11-2345',
        waitingMinutes: expect.any(Number),
        waitedTooLong: true,
      },
      {
        id: fresh.id,
        number: fresh.number,
        customerCode: 'CUST-01',
        vehicleNumber: 'DHAKA METRO-TA 11-2345',
        waitingMinutes: 0,
        waitedTooLong: false,
      },
    ]);
    expect(gate[0].waitingMinutes).toBeGreaterThanOrEqual(120);
    gateQueueResponse.parse(gate);
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const api =
      role === OWNER
        ? owner
        : role === MANAGER
          ? manager
          : role === Role.SUPERVISOR
            ? supervisor
            : role === Role.OPERATOR
              ? operator
              : role === Role.STOREKEEPER
                ? storekeeper
                : apiFor(app, await tokenFor(app, role));
    const allowed = role === OWNER || role === MANAGER;

    for (const path of DASHBOARD_PATHS) {
      await api.get(`/dashboard/${path}`).expect(allowed ? 200 : 403);
    }
  });
});
