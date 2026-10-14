import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { factoryToday } from '../src/common/dates.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { pageOf } from '../src/common/list-query.js';
import {
  challanDetailsResponse,
  challanResponse,
  customerReturnResponse,
} from '../src/dispatch/responses.js';
import { Role } from '../src/generated/prisma/client.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

const { OWNER, MANAGER, SUPERVISOR, STOREKEEPER, GUARD } = Role;

// Written out rather than imported, so a wrong role list in the code fails.
const ACCESS = {
  postChallans: [OWNER, MANAGER, STOREKEEPER],
  gate: [OWNER, MANAGER, SUPERVISOR, STOREKEEPER, GUARD],
  read: [OWNER, MANAGER, SUPERVISOR, STOREKEEPER],
  reverseAndReturn: [OWNER, MANAGER],
};

interface DeliveryLine {
  productId: string;
  deliveredPieces: number;
  returnedPieces: number;
  remainingPieces: number;
}

describe('dispatch', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Api;
  let supervisor: Api;
  let storekeeper: Api;
  let operator: Api;
  let customer: string;
  let otherCustomer: string;
  let cap: string;
  let jar: string;
  let box: string;
  let fgStore: string;
  let scrapYard: string;
  let rmStore: string;
  const today = factoryToday();

  const created = async (path: string, body: object) =>
    (await owner.post(path).send(body).expect(201)).body.id as string;
  const message = async (pending: Promise<Response>, status: number) => {
    const response = await pending;
    expect(response.status).toBe(status);
    return response.body.message;
  };

  const createOrder = async (
    lines: [string, number][] = [
      [cap, 1_000],
      [jar, 100],
    ],
    overrides: object = {},
  ) =>
    (
      await owner
        .post('/sales-orders')
        .send({
          customerId: customer,
          orderDate: '2026-10-14',
          deliveryDate: '2026-10-30',
          lines: lines.map(([productId, pieces]) => ({ productId, pieces })),
          ...overrides,
        })
        .expect(201)
    ).body;
  const confirmedOrder = async (
    lines?: [string, number][],
    overrides: object = {},
  ) => {
    const order = await createOrder(lines, overrides);
    await owner.post(`/sales-orders/${order.id}/confirm`).expect(200);
    return order;
  };
  const closeShort = (orderId: string, api = owner) =>
    api
      .post(`/sales-orders/${orderId}/close-short`)
      .send({ reason: 'Customer needs no more' });
  const status = async (orderId: string) =>
    (await owner.get(`/sales-orders/${orderId}`).expect(200)).body.status;
  const deliveryOf = async (orderId: string, productId: string) =>
    (
      await owner.get(`/sales-orders/${orderId}/delivery`).expect(200)
    ).body.lines.find((line: DeliveryLine) => line.productId === productId);

  const postChallan = (
    orderId: string,
    lines: [string, number][],
    overrides: object = {},
    api = storekeeper,
  ) =>
    api.post('/dispatch/challans').send({
      orderId,
      fromLocationId: fgStore,
      vehicleNumber: 'dhaka metro-ta 11-2345',
      driverName: 'Abdul Karim',
      driverPhone: '01812345678',
      lines: lines.map(([productId, pieces]) => ({ productId, pieces })),
      ...overrides,
    });
  const challanFor = async (orderId: string, lines: [string, number][]) =>
    (await postChallan(orderId, lines).expect(201)).body;
  const passGate = (challanId: string, api = supervisor) =>
    api.post(`/dispatch/challans/${challanId}/gate-pass`);
  const reverseChallan = (challanId: string, api = owner) =>
    api
      .post(`/dispatch/challans/${challanId}/reverse`)
      .send({ reason: 'Wrong vehicle loaded' });
  const recordReturn = (
    challanId: string,
    lines: [string, number][],
    overrides: object = {},
    api = owner,
  ) =>
    api.post('/dispatch/returns').send({
      challanId,
      toLocationId: fgStore,
      reason: 'DAMAGED',
      settlement: 'REPLACE',
      lines: lines.map(([productId, pieces]) => ({ productId, pieces })),
      ...overrides,
    });
  const reverseReturn = (returnId: string, api = owner) =>
    api
      .post(`/dispatch/returns/${returnId}/reverse`)
      .send({ reason: 'Counted twice' });
  // The whole default order on one challan, through the gate.
  const shipped = async () => {
    const order = await confirmedOrder();
    const challan = await challanFor(order.id, [
      [cap, 1_000],
      [jar, 100],
    ]);
    await passGate(challan.id).expect(200);
    return { order, challan };
  };

  const pieces = async (itemId: string, locationId: string) =>
    (
      await owner
        .get(`/stock/balances?itemId=${itemId}&locationId=${locationId}`)
        .expect(200)
    ).body.items[0]?.pieces ?? 0;

  beforeEach(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
    supervisor = apiFor(app, await tokenFor(app, Role.SUPERVISOR));
    storekeeper = apiFor(app, await tokenFor(app, Role.STOREKEEPER));
    operator = apiFor(app, await tokenFor(app, Role.OPERATOR));

    const partner = (code: string) => ({
      code,
      name: code,
      phone: '01712345678',
      address: 'Plot 12, Tejgaon I/A, Dhaka',
    });
    customer = await created('/customers', partner('CUST-01'));
    otherCustomer = await created('/customers', partner('CUST-02'));
    const product = (code: string, pieceWeightMg: number) =>
      created('/products', {
        code,
        name: code,
        pieceWeightMg,
        colour: 'Natural',
        piecesPerCarton: 100,
      });
    cap = await product('CAP-28', 2_500);
    jar = await product('JAR-1L', 40_000);
    box = await product('BOX-01', 100_000);

    const location = (code: string, kind: string) =>
      created('/locations', { code, name: code, kind });
    fgStore = await location('FG-STORE', 'FINISHED_GOODS_STORE');
    scrapYard = await location('SCRAP', 'SCRAP_YARD');
    rmStore = await location('RM-STORE', 'RAW_MATERIAL_STORE');
    await created('/stock/openings', {
      locationId: fgStore,
      lines: [
        { itemType: 'PRODUCT', itemId: cap, pieces: 5_000 },
        { itemType: 'PRODUCT', itemId: jar, pieces: 500 },
        { itemType: 'PRODUCT', itemId: box, pieces: 100 },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('challans', () => {
    it('delivers part of an order from a finished goods store', async () => {
      const order = await confirmedOrder();

      const first = await challanFor(order.id, [[cap, 400]]);

      expect(first).toMatchObject({
        orderId: order.id,
        customerId: customer,
        vehicleNumber: 'DHAKA METRO-TA 11-2345',
        driverPhone: '+8801812345678',
        deliveryAddress: 'Plot 12, Tejgaon I/A, Dhaka',
        dispatchedOn: today,
        gatePassStatus: 'PENDING',
        gatePassedAt: null,
        reversedAt: null,
        lines: [{ productId: cap, pieces: 400, returnedPieces: 0 }],
      });
      expect(first.number).toMatch(/^DC-\d{6}$/);
      expect(await pieces(cap, fgStore)).toBe(4_600);
      // Shipped from stock: the first challan starts production.
      expect(await status(order.id)).toBe('IN_PRODUCTION');

      const second = await postChallan(
        order.id,
        [
          [cap, 600],
          [jar, 40],
        ],
        { deliveryAddress: 'Warehouse 3, Gazipur' },
      ).expect(201);

      expect(second.body.deliveryAddress).toBe('Warehouse 3, Gazipur');
      expect(
        (await owner.get(`/sales-orders/${order.id}/delivery`).expect(200)).body
          .lines,
      ).toEqual([
        {
          lineNo: 1,
          productId: cap,
          code: 'CAP-28',
          orderedPieces: 1_000,
          deliveredPieces: 1_000,
          returnedPieces: 0,
          remainingPieces: 0,
          allowedPieces: 0,
        },
        {
          lineNo: 2,
          productId: jar,
          code: 'JAR-1L',
          orderedPieces: 100,
          deliveredPieces: 40,
          returnedPieces: 0,
          remainingPieces: 60,
          allowedPieces: 60,
        },
      ]);
      expect(await status(order.id)).toBe('IN_PRODUCTION');
      const listed = (
        await owner.get(`/dispatch/challans?orderId=${order.id}`).expect(200)
      ).body;
      expect(listed.items.map((challan: { id: string }) => challan.id)).toEqual(
        [second.body.id, first.id],
      );
    });

    it('refuses more than the order still needs, or what the order or store cannot give', async () => {
      const order = await confirmedOrder();

      expect(await message(postChallan(order.id, [[cap, 1_001]]), 409)).toBe(
        `${order.number} can take only 1000 more CAP-28`,
      );
      await challanFor(order.id, [[cap, 700]]);
      expect(await message(postChallan(order.id, [[cap, 301]]), 409)).toBe(
        `${order.number} can take only 300 more CAP-28`,
      );
      expect(await message(postChallan(order.id, [[box, 1]]), 400)).toBe(
        `BOX-01 is not on ${order.number}`,
      );
      expect(
        await message(
          postChallan(order.id, [[cap, 1]], { fromLocationId: scrapYard }),
          400,
        ),
      ).toBe('Deliver from an active finished goods store');

      const big = await confirmedOrder([[jar, 1_000]]);
      expect(await message(postChallan(big.id, [[jar, 600]]), 409)).toBe(
        'Not enough stock for JAR-1L',
      );
      expect(await status(big.id)).toBe('CONFIRMED');
      expect((await deliveryOf(big.id, jar)).deliveredPieces).toBe(0);

      const draft = await createOrder();
      expect(await message(postChallan(draft.id, [[cap, 1]]), 409)).toBe(
        `${draft.number} is DRAFT; only CONFIRMED or IN_PRODUCTION orders can be delivered`,
      );
      await postChallan(randomUUID(), [[cap, 1]]).expect(404);
      await postChallan(order.id, [[cap, 1]], { driverPhone: '12345' }).expect(
        400,
      );
      await postChallan(order.id, []).expect(400);
      await postChallan(order.id, [[cap, 0]]).expect(400);
      await postChallan(order.id, [
        [cap, 1],
        [cap, 2],
      ]).expect(400);
    });

    it('allows the over-delivery tolerance set on the order', async () => {
      await owner
        .post('/sales-orders')
        .send({
          customerId: customer,
          orderDate: '2026-10-14',
          deliveryDate: '2026-10-30',
          lines: [{ productId: cap, pieces: 1_000 }],
          overDeliveryBasisPoints: 10_001,
        })
        .expect(400);
      const order = await confirmedOrder([[cap, 1_000]], {
        overDeliveryBasisPoints: 200,
      });
      await challanFor(order.id, [[cap, 300]]);
      expect(await deliveryOf(order.id, cap)).toMatchObject({
        remainingPieces: 700,
        allowedPieces: 720,
      });

      expect(await message(postChallan(order.id, [[cap, 721]]), 409)).toBe(
        `${order.number} can take only 720 more CAP-28`,
      );
      await challanFor(order.id, [[cap, 720]]);

      expect(await status(order.id)).toBe('COMPLETED');
      expect(await deliveryOf(order.id, cap)).toMatchObject({
        deliveredPieces: 1_020,
        remainingPieces: 0,
        allowedPieces: 0,
      });
      expect(await message(postChallan(order.id, [[cap, 1]]), 409)).toBe(
        `${order.number} is COMPLETED; only CONFIRMED or IN_PRODUCTION orders can be delivered`,
      );
    });

    it('completes the order with the challan that delivers its last line', async () => {
      const order = await confirmedOrder();
      await challanFor(order.id, [[cap, 1_000]]);
      expect(await status(order.id)).toBe('IN_PRODUCTION');

      await challanFor(order.id, [[jar, 100]]);
      expect(await status(order.id)).toBe('COMPLETED');

      // All at once from a confirmed order: started and completed together.
      const fromStock = await confirmedOrder([[jar, 50]]);
      await challanFor(fromStock.id, [[jar, 50]]);
      expect(await status(fromStock.id)).toBe('COMPLETED');
      const events = await prisma.outboxEvent.findMany({
        where: { type: { startsWith: 'sales_order.' } },
        orderBy: { occurredAt: 'asc' },
      });
      expect(
        events
          .filter(
            (event) =>
              (event.payload as { orderId: string }).orderId === fromStock.id,
          )
          .map((event) => event.type),
      ).toEqual([
        'sales_order.created',
        'sales_order.confirmed',
        'sales_order.in_production',
        'sales_order.completed',
      ]);
    });

    it('lets only one of two challans that together over-deliver go through', async () => {
      const order = await confirmedOrder();

      const responses = await Promise.all([
        postChallan(order.id, [[cap, 600]]),
        postChallan(order.id, [[cap, 600]]),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await deliveryOf(order.id, cap)).deliveredPieces).toBe(600);
      expect(await pieces(cap, fgStore)).toBe(4_400);
      expect(await prisma.deliveryChallan.count()).toBe(1);
    });

    it('lists challans newest first, by order, customer, dispatch date and gate pass', async () => {
      const order = await confirmedOrder();
      const passed = await challanFor(order.id, [[cap, 100]]);
      await passGate(passed.id).expect(200);
      const reversed = await challanFor(order.id, [[cap, 10]]);
      await reverseChallan(reversed.id).expect(201);
      const other = await confirmedOrder([[cap, 10]], {
        customerId: otherCustomer,
      });
      const waiting = await challanFor(other.id, [[cap, 10]]);
      const list = async (query: string) =>
        (await owner.get(`/dispatch/challans?${query}`).expect(200)).body;
      const ids = async (query: string) =>
        (await list(query)).items.map((c: { id: string }) => c.id);

      expect(await ids('')).toEqual([waiting.id, reversed.id, passed.id]);
      expect(await ids(`orderId=${other.id}`)).toEqual([waiting.id]);
      expect(
        await ids(`customerId=${customer}&from=${today}&to=${today}`),
      ).toEqual([reversed.id, passed.id]);
      expect(await ids(`customerId=${customer}&to=2026-01-31`)).toEqual([]);
      expect(await ids(`from=${today}`)).toHaveLength(3);
      // A reversed challan never waits at the gate.
      expect(await ids('gatePass=PENDING')).toEqual([waiting.id]);
      expect(await ids('gatePass=PASSED')).toEqual([passed.id]);
      expect(await list('pageSize=2&page=2')).toMatchObject({
        total: 3,
        page: 2,
        pageSize: 2,
        items: [{ id: passed.id }],
      });
      await owner
        .get('/dispatch/challans?from=2026-02-01&to=2026-01-31')
        .expect(400);
      await owner.get('/dispatch/challans?gatePass=WAITING').expect(400);
    });

    it('reads one challan with the names its printout needs', async () => {
      const order = await confirmedOrder(
        [
          [jar, 100],
          [cap, 1_000],
        ],
        { customerPo: 'PO-7781' },
      );
      const challan = await challanFor(order.id, [
        [jar, 40],
        [cap, 250],
      ]);

      const read = (
        await storekeeper.get(`/dispatch/challans/${challan.id}`).expect(200)
      ).body;

      expect(read).toMatchObject({
        number: challan.number,
        customerCode: 'CUST-01',
        customerName: 'CUST-01',
        orderNumber: order.number,
        customerPo: 'PO-7781',
        lines: [
          { code: 'CAP-28', name: 'CAP-28', pieces: 250, piecesPerCarton: 100 },
          { code: 'JAR-1L', name: 'JAR-1L', pieces: 40, piecesPerCarton: 100 },
        ],
      });
      await owner.get(`/dispatch/challans/${randomUUID()}`).expect(404);
      await owner.get('/dispatch/challans/not-a-uuid').expect(400);
    });
  });

  describe('closing short', () => {
    it('ends an order early, and nothing reopens it', async () => {
      const order = await confirmedOrder();
      const passed = await challanFor(order.id, [[cap, 400]]);
      await passGate(passed.id).expect(200);
      const pending = await challanFor(order.id, [[cap, 100]]);

      const closed = (await closeShort(order.id).expect(200)).body;

      expect(closed).toMatchObject({
        status: 'COMPLETED',
        shortCloseReason: 'Customer needs no more',
      });
      expect(await message(postChallan(order.id, [[cap, 1]]), 409)).toBe(
        `${order.number} is COMPLETED; only CONFIRMED or IN_PRODUCTION orders can be delivered`,
      );
      await reverseChallan(pending.id).expect(201);
      await recordReturn(passed.id, [[cap, 10]]).expect(201);
      expect(await status(order.id)).toBe('COMPLETED');
      expect(await deliveryOf(order.id, cap)).toMatchObject({
        deliveredPieces: 390,
        returnedPieces: 10,
      });
      await closeShort(order.id).expect(409);
    });
  });

  describe('gate pass', () => {
    it('is passed once, by anyone but an operator, and then the challan cannot be reversed', async () => {
      const order = await confirmedOrder();
      const challan = await challanFor(order.id, [[cap, 400]]);
      const guard = apiFor(app, await tokenFor(app, Role.GUARD));
      const pending = async () =>
        (await guard.get('/dispatch/gate-passes/pending').expect(200)).body;
      const pendingIds = async () =>
        (await pending()).map((c: { id: string }) => c.id);
      expect(await pending()).toMatchObject([
        {
          id: challan.id,
          customerName: 'CUST-01',
          vehicleNumber: 'DHAKA METRO-TA 11-2345',
          lines: [{ code: 'CAP-28', pieces: 400, piecesPerCarton: 100 }],
        },
      ]);

      await passGate(challan.id, operator).expect(403);
      const passed = (await passGate(challan.id, storekeeper).expect(200)).body;

      const storekeeperUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'storekeeper@example.com' },
      });
      expect(passed).toMatchObject({
        gatePassStatus: 'PASSED',
        gatePassedById: storekeeperUser.id,
      });
      expect(passed.gatePassedAt).not.toBeNull();
      expect(await pendingIds()).toEqual([]);
      expect(await message(passGate(challan.id), 409)).toBe(
        `${challan.number} has already passed the gate`,
      );
      expect(await message(reverseChallan(challan.id), 409)).toBe(
        `${challan.number} has passed the gate; record a customer return instead`,
      );
      expect(await pieces(cap, fgStore)).toBe(4_600);
    });

    it('reverses a challan before the gate, reopening a completed order', async () => {
      const order = await confirmedOrder();
      const challan = await challanFor(order.id, [
        [cap, 1_000],
        [jar, 100],
      ]);
      expect(await status(order.id)).toBe('COMPLETED');

      await reverseChallan(challan.id, storekeeper).expect(403);
      const reversed = (await reverseChallan(challan.id).expect(201)).body;

      expect(reversed.reversedAt).not.toBeNull();
      expect(await pieces(cap, fgStore)).toBe(5_000);
      expect(await status(order.id)).toBe('IN_PRODUCTION');
      expect((await deliveryOf(order.id, cap)).deliveredPieces).toBe(0);
      expect(await message(reverseChallan(challan.id), 409)).toBe(
        'This challan is already reversed',
      );
      expect(await message(passGate(challan.id), 409)).toBe(
        `${challan.number} is reversed`,
      );
      expect(
        await message(
          owner
            .post(`/stock/documents/${challan.stockDocumentId}/reverse`)
            .send({ reason: 'Try' }),
          409,
        ),
      ).toBe('Delivery challans are reversed from dispatch');
    });
  });

  describe('customer returns', () => {
    it('takes pieces back for replacement, reopening the order until they are sent again', async () => {
      const { order, challan } = await shipped();
      expect(await status(order.id)).toBe('COMPLETED');

      const returned = (await recordReturn(challan.id, [[cap, 30]]).expect(201))
        .body;

      expect(returned).toMatchObject({
        challanId: challan.id,
        toLocationId: fgStore,
        reason: 'DAMAGED',
        settlement: 'REPLACE',
        returnedOn: today,
        lines: [{ productId: cap, pieces: 30 }],
      });
      expect(returned.number).toMatch(/^CRN-\d{6}$/);
      expect(await pieces(cap, fgStore)).toBe(4_030);
      expect(await deliveryOf(order.id, cap)).toMatchObject({
        deliveredPieces: 970,
        returnedPieces: 30,
        remainingPieces: 30,
      });
      expect(await status(order.id)).toBe('IN_PRODUCTION');

      await challanFor(order.id, [[cap, 30]]);
      expect(await status(order.id)).toBe('COMPLETED');
    });

    it('credits a return into the scrap yard without touching the order', async () => {
      const { order, challan } = await shipped();

      await recordReturn(challan.id, [[cap, 20]], {
        settlement: 'CREDIT',
        reason: 'QUALITY',
        toLocationId: scrapYard,
      }).expect(201);

      expect(await pieces(cap, scrapYard)).toBe(20);
      expect(await deliveryOf(order.id, cap)).toMatchObject({
        deliveredPieces: 1_000,
        returnedPieces: 20,
        remainingPieces: 0,
      });
      expect(await status(order.id)).toBe('COMPLETED');
    });

    it('takes back only what a challan through the gate delivered, into a store or scrap yard', async () => {
      const order = await confirmedOrder();
      const challan = await challanFor(order.id, [[cap, 500]]);

      expect(await message(recordReturn(challan.id, [[cap, 1]]), 409)).toBe(
        `${challan.number} has not passed the gate; reverse it instead`,
      );
      await passGate(challan.id).expect(200);
      expect(await message(recordReturn(challan.id, [[cap, 501]]), 409)).toBe(
        `${challan.number} has only 500 CAP-28 left to return`,
      );
      await recordReturn(challan.id, [[cap, 30]]).expect(201);
      expect(await message(recordReturn(challan.id, [[cap, 471]]), 409)).toBe(
        `${challan.number} has only 470 CAP-28 left to return`,
      );
      expect(await message(recordReturn(challan.id, [[jar, 1]]), 400)).toBe(
        `JAR-1L is not on ${challan.number}`,
      );
      expect(
        await message(
          recordReturn(challan.id, [[cap, 1]], { toLocationId: rmStore }),
          400,
        ),
      ).toBe('Returns go to an active finished goods store or scrap yard');
      await recordReturn(challan.id, [[cap, 1]], {
        settlement: undefined,
      }).expect(400);
      await recordReturn(challan.id, [[cap, 1]], { reason: 'LATE' }).expect(
        400,
      );
      await recordReturn(challan.id, [[cap, 1]], {}, storekeeper).expect(403);
    });

    it('reverses a return, unless its replacement has already gone out', async () => {
      const { order, challan } = await shipped();
      const replaced = (await recordReturn(challan.id, [[cap, 30]]).expect(201))
        .body;
      const credited = (
        await recordReturn(challan.id, [[jar, 5]], {
          settlement: 'CREDIT',
        }).expect(201)
      ).body;

      const reversed = (await reverseReturn(replaced.id).expect(201)).body;

      expect(reversed.reversedAt).not.toBeNull();
      expect(await deliveryOf(order.id, cap)).toMatchObject({
        deliveredPieces: 1_000,
        returnedPieces: 0,
      });
      expect(await status(order.id)).toBe('COMPLETED');
      expect(await pieces(cap, fgStore)).toBe(4_000);
      expect(await message(reverseReturn(replaced.id), 409)).toBe(
        'This return is already reversed',
      );
      expect(
        await message(
          owner
            .post(`/stock/documents/${replaced.stockDocumentId}/reverse`)
            .send({ reason: 'Try' }),
          409,
        ),
      ).toBe('Customer returns are reversed from dispatch');
      await reverseReturn(credited.id).expect(201);
      expect(await deliveryOf(order.id, jar)).toMatchObject({
        deliveredPieces: 100,
        returnedPieces: 0,
      });

      const again = (await recordReturn(challan.id, [[cap, 30]]).expect(201))
        .body;
      await challanFor(order.id, [[cap, 30]]);
      expect(await message(reverseReturn(again.id), 409)).toBe(
        `${order.number} can take only 0 more CAP-28`,
      );
      await reverseReturn(randomUUID()).expect(404);
    });
  });

  it('answers in the shapes the OpenAPI spec promises', async () => {
    const { order, challan } = await shipped();
    const returned = (await recordReturn(challan.id, [[cap, 30]]).expect(201))
      .body;

    // One still at the gate, so the pending list has something to parse.
    await challanFor((await confirmedOrder()).id, [[cap, 10]]);
    const details = challanDetailsResponse.strict();

    challanResponse.strict().parse(challan);
    customerReturnResponse.strict().parse(returned);
    pageOf(details)
      .strict()
      .parse(
        (await owner.get(`/dispatch/challans?orderId=${order.id}`).expect(200))
          .body,
      );
    details.parse(
      (await owner.get(`/dispatch/challans/${challan.id}`).expect(200)).body,
    );
    expect(
      z
        .array(details)
        .parse(
          (await owner.get('/dispatch/gate-passes/pending').expect(200)).body,
        ),
    ).toHaveLength(1);
  });

  it('records the same challan and the same return once when sent twice', async () => {
    const order = await confirmedOrder();
    const twice = async (send: () => ReturnType<typeof postChallan>) => {
      const first = await send().expect(201);
      const second = await send().expect(201);
      expect(second.body).toEqual(first.body);
      return first.body;
    };

    const challan = await twice(() =>
      postChallan(order.id, [[cap, 400]]).set('Idempotency-Key', 'dc-1'),
    );
    await passGate(challan.id).expect(200);
    await twice(() =>
      recordReturn(challan.id, [[cap, 30]]).set('Idempotency-Key', 'crn-1'),
    );

    expect(await prisma.deliveryChallan.count()).toBe(1);
    expect(await prisma.customerReturn.count()).toBe(1);
    expect(await deliveryOf(order.id, cap)).toMatchObject({
      deliveredPieces: 370,
      returnedPieces: 30,
    });
    expect(await pieces(cap, fgStore)).toBe(4_630);
  });

  it('writes outbox events and keeps every ledger sum equal to its balance', async () => {
    const { challan } = await shipped();
    const returned = (await recordReturn(challan.id, [[cap, 30]]).expect(201))
      .body;
    await reverseReturn(returned.id).expect(201);
    const order = await confirmedOrder([[jar, 10]]);
    const reversed = await challanFor(order.id, [[jar, 10]]);
    await reverseChallan(reversed.id).expect(201);

    const types = (await prisma.outboxEvent.findMany()).map(
      (event) => event.type,
    );
    expect(types).toEqual(
      expect.arrayContaining([
        'stock.dispatch.posted',
        'dispatch.challan_posted',
        'dispatch.gate_passed',
        'stock.customer_return.posted',
        'dispatch.customer_return_recorded',
        'dispatch.customer_return_reversed',
        'dispatch.challan_reversed',
        'sales_order.completed',
        'sales_order.reopened',
      ]),
    );
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
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const order = await confirmedOrder();
    const toPass = await challanFor(order.id, [[cap, 10]]);
    const toReverse = await challanFor(order.id, [[cap, 10]]);
    const passed = await challanFor(order.id, [[cap, 10]]);
    await passGate(passed.id, owner).expect(200);
    const toReverseReturn = (
      await recordReturn(passed.id, [[cap, 1]], {
        settlement: 'CREDIT',
      }).expect(201)
    ).body;
    const toClose = await confirmedOrder([[jar, 10]]);
    await owner
      .post(`/sales-orders/${toClose.id}/start-production`)
      .expect(200);

    const loggedIn: Partial<Record<Role, Api>> = {
      OWNER: owner,
      SUPERVISOR: supervisor,
      STOREKEEPER: storekeeper,
      OPERATOR: operator,
    };
    const api = loggedIn[role] ?? apiFor(app, await tokenFor(app, role));
    const allowed = (roles: Role[], ok: number) =>
      roles.includes(role) ? ok : 403;
    const { postChallans, gate, read, reverseAndReturn } = ACCESS;

    await postChallan(order.id, [[cap, 10]], {}, api).expect(
      allowed(postChallans, 201),
    );
    await passGate(toPass.id, api).expect(allowed(gate, 200));
    await reverseChallan(toReverse.id, api).expect(
      allowed(reverseAndReturn, 201),
    );
    await recordReturn(passed.id, [[cap, 1]], {}, api).expect(
      allowed(reverseAndReturn, 201),
    );
    await reverseReturn(toReverseReturn.id, api).expect(
      allowed(reverseAndReturn, 201),
    );
    await closeShort(toClose.id, api).expect(allowed(reverseAndReturn, 200));
    await api
      .get(`/dispatch/challans?orderId=${order.id}`)
      .expect(allowed(read, 200));
    await api.get(`/dispatch/challans/${passed.id}`).expect(allowed(read, 200));
    await api.get('/dispatch/gate-passes/pending').expect(allowed(gate, 200));
    await api
      .get(`/sales-orders/${order.id}/delivery`)
      .expect(allowed(read, 200));
  });
});
