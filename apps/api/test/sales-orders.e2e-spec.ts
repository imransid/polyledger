import type { INestApplication } from '@nestjs/common';
import { requiredMaterial } from '@polyledger/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { pageOf } from '../src/common/list-query.js';
import {
  materialCheckResponse,
  materialShortagesResponse,
  orderDeliveryResponse,
  salesOrderResponse,
} from '../src/orders/responses.js';
import { SALES_EDITORS, SALES_READERS } from '../src/orders/roles.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

describe('sales orders', () => {
  let app: INestApplication;
  let owner: Api;
  let customer: string;
  let otherCustomer: string;
  let cap: string;
  let jar: string;
  let box: string;
  let finishedGoods: string;

  const created = async (path: string, body: object) =>
    (await owner.post(path).send(body).expect(201)).body.id as string;

  const order = (overrides: object = {}) =>
    owner.post('/sales-orders').send({
      customerId: customer,
      orderDate: '2026-10-14',
      deliveryDate: '2026-10-30',
      lines: [{ productId: cap, pieces: 10_000, unitPricePoisha: 150 }],
      ...overrides,
    });
  const createOrder = async (overrides: object = {}) =>
    (await order(overrides).expect(201)).body;

  const act = (id: string, action: string, body: object = {}) =>
    owner.post(`/sales-orders/${id}/${action}`).send(body);
  const confirmed = async (overrides: object = {}) => {
    const created = await createOrder(overrides);
    await act(created.id, 'confirm').expect(200);
    return created;
  };

  const salesEvents = () =>
    app.get(PrismaService).outboxEvent.findMany({
      where: { type: { startsWith: 'sales_order.' } },
      orderBy: { occurredAt: 'asc' },
    });

  beforeEach(async () => {
    app = await startApp();
    owner = apiFor(app, await tokenFor(app, Role.OWNER));

    const partner = (code: string) => ({
      code,
      name: code,
      phone: '01712345678',
      address: 'Gazipur',
    });
    customer = await created('/customers', partner('CUST-01'));
    otherCustomer = await created('/customers', partner('CUST-02'));

    const material = (code: string, type: string) =>
      created('/raw-materials', {
        code,
        name: code,
        type,
        minimumStockGrams: 0,
      });
    const pp = await material('RM-PP-01', 'RESIN');
    const mb = await material('MB-RED-01', 'MASTERBATCH');
    const hdpe = await material('RM-HD-01', 'RESIN');

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

    const activeFormula = async (
      productId: string,
      wasteBasisPoints: number,
      lines: [string, number][],
    ) => {
      const id = await created(`/products/${productId}/formulas`, {
        wasteBasisPoints,
        lines: lines.map(([rawMaterialId, basisPoints]) => ({
          rawMaterialId,
          basisPoints,
        })),
      });
      await owner.post(`/formulas/${id}/activate`).expect(200);
    };
    await activeFormula(cap, 400, [
      [pp, 9_800],
      [mb, 200],
    ]);
    await activeFormula(jar, 250, [[hdpe, 10_000]]);

    const location = (code: string, kind: string) =>
      created('/locations', { code, name: code, kind });
    const store = await location('RM-STORE', 'RAW_MATERIAL_STORE');
    const floor = await location('FLOOR', 'PRODUCTION_FLOOR');
    finishedGoods = await location('FG-STORE', 'FINISHED_GOODS_STORE');

    const opening = (locationId: string, lines: object[]) =>
      created('/stock/openings', { locationId, lines });
    await opening(store, [
      { itemType: 'RAW_MATERIAL', itemId: pp, kilograms: '20' },
      { itemType: 'RAW_MATERIAL', itemId: mb, kilograms: '1' },
    ]);
    // Already issued to the floor: never counts as available.
    await opening(floor, [
      { itemType: 'RAW_MATERIAL', itemId: pp, kilograms: '5' },
    ]);
    await opening(finishedGoods, [
      { itemType: 'PRODUCT', itemId: cap, pieces: 2_000 },
    ]);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('creating and changing', () => {
    it('creates a numbered draft', async () => {
      const draft = await createOrder({ customerPo: 'PO-4411' });

      expect(draft).toMatchObject({
        status: 'DRAFT',
        orderDate: '2026-10-14',
        deliveryDate: '2026-10-30',
        customerPo: 'PO-4411',
        lines: [
          { lineNo: 1, productId: cap, pieces: 10_000, unitPricePoisha: 150 },
        ],
      });
      expect(draft.number).toMatch(/^SO-\d{6}$/);
    });

    it('rejects an order that does not make sense', async () => {
      await order({ deliveryDate: '2026-10-13' }).expect(400);
      await order({
        lines: [
          { productId: cap, pieces: 1 },
          { productId: cap, pieces: 2 },
        ],
      }).expect(400);
      await order({ lines: [{ productId: cap, pieces: 0 }] }).expect(400);

      await owner.post(`/customers/${otherCustomer}/deactivate`).expect(200);
      await order({ customerId: otherCustomer }).expect(400);
      await owner.post(`/products/${jar}/deactivate`).expect(200);
      const inactive = await order({
        lines: [{ productId: jar, pieces: 1 }],
      }).expect(400);
      expect(inactive.body.message).toBe('JAR-1L is inactive');
    });

    it('lets a draft change freely', async () => {
      const draft = await createOrder();

      const changed = await owner
        .patch(`/sales-orders/${draft.id}`)
        .send({
          customerId: otherCustomer,
          notes: 'Call before delivery',
          lines: [{ productId: jar, pieces: 50 }],
        })
        .expect(200);

      expect(changed.body).toMatchObject({
        customerId: otherCustomer,
        notes: 'Call before delivery',
        lines: [{ productId: jar, pieces: 50, unitPricePoisha: null }],
      });
    });

    it('lets a confirmed order change only its pieces, delivery date and tolerance, recording old and new', async () => {
      const so = await confirmed();

      const changed = await owner
        .patch(`/sales-orders/${so.id}`)
        .send({
          deliveryDate: '2026-11-05',
          overDeliveryBasisPoints: 200,
          lines: [{ productId: cap, pieces: 12_000, unitPricePoisha: 150 }],
        })
        .expect(200);

      expect(changed.body).toMatchObject({
        status: 'CONFIRMED',
        deliveryDate: '2026-11-05',
        overDeliveryBasisPoints: 200,
        lines: [{ productId: cap, pieces: 12_000 }],
      });
      const events = await salesEvents();
      expect(events.at(-1)).toMatchObject({
        type: 'sales_order.changed',
        payload: {
          number: so.number,
          changes: {
            deliveryDate: { from: '2026-10-30', to: '2026-11-05' },
            overDeliveryBasisPoints: { from: 0, to: 200 },
            lines: {
              from: [{ productId: cap, pieces: 10_000 }],
              to: [{ productId: cap, pieces: 12_000 }],
            },
          },
        },
      });

      for (const refused of [
        { notes: 'Rush' },
        { customerId: otherCustomer },
        { lines: [{ productId: cap, pieces: 12_000, unitPricePoisha: 99 }] },
        {
          lines: [
            { productId: cap, pieces: 12_000, unitPricePoisha: 150 },
            { productId: jar, pieces: 10 },
          ],
        },
      ]) {
        const response = await owner
          .patch(`/sales-orders/${so.id}`)
          .send(refused)
          .expect(409);
        expect(response.body.message).toBe(
          'A confirmed order can only change its pieces, delivery date and over-delivery tolerance',
        );
      }
    });

    it('cannot change once production has started', async () => {
      const so = await confirmed();
      await act(so.id, 'start-production').expect(200);

      const response = await owner
        .patch(`/sales-orders/${so.id}`)
        .send({ deliveryDate: '2026-11-05' })
        .expect(409);

      expect(response.body.message).toBe(
        `${so.number} is IN_PRODUCTION and can no longer be changed`,
      );
    });
  });

  describe('status flow', () => {
    it('goes from draft to closed short, with an event at each step', async () => {
      const so = await createOrder();

      await act(so.id, 'confirm').expect(200);
      await act(so.id, 'start-production').expect(200);
      await act(so.id, 'close-short', { reason: ' ' }).expect(400);
      const done = await act(so.id, 'close-short', {
        reason: 'Customer needs no more',
      }).expect(200);

      expect(done.body).toMatchObject({
        status: 'COMPLETED',
        shortCloseReason: 'Customer needs no more',
      });
      expect((await salesEvents()).map((e) => e.type)).toEqual([
        'sales_order.created',
        'sales_order.confirmed',
        'sales_order.in_production',
        'sales_order.closed_short',
      ]);
      await act(so.id, 'complete').expect(404);
    });

    it('refuses steps out of order', async () => {
      const so = await createOrder();

      const early = await act(so.id, 'start-production').expect(409);
      expect(early.body.message).toBe(
        `${so.number} is DRAFT; only CONFIRMED orders can be put into production`,
      );
      const short = { reason: 'Stop' };
      await act(so.id, 'close-short', short).expect(409);
      await act(so.id, 'confirm').expect(200);
      await act(so.id, 'confirm').expect(409);
      const notStarted = await act(so.id, 'close-short', short).expect(409);
      expect(notStarted.body.message).toBe(
        `${so.number} is CONFIRMED; only IN_PRODUCTION orders can be closed short`,
      );
    });

    it('cancels only before production starts, and needs a reason', async () => {
      const draft = await createOrder();
      const cancelled = await act(draft.id, 'cancel', {
        reason: 'Customer withdrew',
      }).expect(200);
      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Customer withdrew',
      });

      const so = await confirmed();
      await act(so.id, 'cancel', { reason: ' ' }).expect(400);
      await act(so.id, 'cancel', { reason: 'Price dispute' }).expect(200);

      const running = await confirmed();
      await act(running.id, 'start-production').expect(200);
      const late = await act(running.id, 'cancel', {
        reason: 'Too late',
      }).expect(409);
      expect(late.body.message).toBe(
        `${running.number} is IN_PRODUCTION; only DRAFT or CONFIRMED orders can be cancelled`,
      );
    });

    it('lets only one of cancel and start production win when both arrive at once', async () => {
      const so = await confirmed();

      const [cancel, start] = await Promise.all([
        act(so.id, 'cancel', { reason: 'Changed mind' }),
        act(so.id, 'start-production'),
      ]);

      expect([cancel.status, start.status].sort()).toEqual([200, 409]);
      const final = (await owner.get(`/sales-orders/${so.id}`).expect(200))
        .body;
      expect(final.status).toBe(
        cancel.status === 200 ? 'CANCELLED' : 'IN_PRODUCTION',
      );
    });
  });

  describe('material check', () => {
    it('shows what each raw material needs, has in raw material stores, and lacks', async () => {
      const so = await createOrder();

      const check = (
        await owner.get(`/sales-orders/${so.id}/material-check`).expect(200)
      ).body;

      // 2,000 caps come from stock; 8,000 x 2.5 g x 1.04 = 20,800 g to make.
      expect(check.products).toEqual([
        {
          productId: cap,
          code: 'CAP-28',
          orderedPieces: 10_000,
          fromStockPieces: 2_000,
          toProducePieces: 8_000,
          formulaVersion: 1,
        },
      ]);
      expect(check.materials).toEqual([
        expect.objectContaining({
          code: 'MB-RED-01',
          neededGrams: 416,
          availableGrams: 1_000,
          shortageGrams: 0,
        }),
        expect.objectContaining({
          code: 'RM-PP-01',
          neededGrams: 20_384,
          availableGrams: 20_000,
          shortageGrams: 384,
        }),
      ]);
      const expected = requiredMaterial({
        pieces: 8_000,
        pieceWeightMg: 2_500,
        wasteBasisPoints: 400,
        lineBasisPoints: [9_800, 200],
      });
      expect(expected.lines).toEqual([20_384, 416]);
    });

    it('needs no formula when finished goods cover the whole line', async () => {
      await owner
        .post('/stock/openings')
        .send({
          locationId: finishedGoods,
          lines: [{ itemType: 'PRODUCT', itemId: box, pieces: 100 }],
        })
        .expect(201);
      const so = await createOrder({ lines: [{ productId: box, pieces: 80 }] });

      const check = (
        await owner.get(`/sales-orders/${so.id}/material-check`).expect(200)
      ).body;

      expect(check.products[0]).toMatchObject({
        fromStockPieces: 80,
        toProducePieces: 0,
        formulaVersion: null,
      });
      expect(check.materials).toEqual([]);
    });

    it('fails clearly when a product to be made has no active formula', async () => {
      const so = await createOrder({
        lines: [
          { productId: cap, pieces: 100 },
          { productId: box, pieces: 10 },
        ],
      });

      const response = await owner
        .get(`/sales-orders/${so.id}/material-check`)
        .expect(409);

      expect(response.body.message).toBe('No active formula for BOX-01');
    });
  });

  it('adds up shortages across confirmed orders, counting finished goods once', async () => {
    await confirmed({ lines: [{ productId: cap, pieces: 6_000 }] });
    await confirmed({
      lines: [
        { productId: cap, pieces: 4_000 },
        { productId: jar, pieces: 100 },
      ],
    });
    await confirmed({ lines: [{ productId: box, pieces: 10 }] });
    await createOrder({ lines: [{ productId: cap, pieces: 50_000 }] });
    const cancelled = await confirmed({
      lines: [{ productId: cap, pieces: 50_000 }],
    });
    await act(cancelled.id, 'cancel', { reason: 'Duplicate' }).expect(200);
    const running = await confirmed({
      lines: [{ productId: cap, pieces: 50_000 }],
    });
    await act(running.id, 'start-production').expect(200);

    const shortages = (
      await owner.get('/sales-orders/material-shortages').expect(200)
    ).body;

    expect(shortages.missingFormulas).toEqual([
      { productId: box, code: 'BOX-01' },
    ]);
    expect(shortages.products).toEqual([
      expect.objectContaining({ code: 'BOX-01', toProducePieces: 10 }),
      expect.objectContaining({
        code: 'CAP-28',
        orderedPieces: 10_000,
        fromStockPieces: 2_000,
        toProducePieces: 8_000,
      }),
      expect.objectContaining({ code: 'JAR-1L', toProducePieces: 100 }),
    ]);
    // 100 jars x 40 g x 1.025 = 4,100 g of HDPE, none in stock.
    expect(
      shortages.materials.map(
        (m: { code: string; neededGrams: number; shortageGrams: number }) => [
          m.code,
          m.neededGrams,
          m.shortageGrams,
        ],
      ),
    ).toEqual([
      ['MB-RED-01', 416, 0],
      ['RM-HD-01', 4_100, 4_100],
      ['RM-PP-01', 20_384, 384],
    ]);
  });

  it('lists orders by status, customer, delivery dates, search and lateness', async () => {
    const overdue = await confirmed({
      orderDate: '2020-01-01',
      deliveryDate: '2020-01-10',
      customerPo: 'PO-OLD',
    });
    const shipped = await confirmed({
      orderDate: '2020-01-01',
      deliveryDate: '2020-01-10',
    });
    await act(shipped.id, 'start-production').expect(200);
    await act(shipped.id, 'close-short', { reason: 'Done' }).expect(200);
    const dropped = await createOrder({
      orderDate: '2020-01-01',
      deliveryDate: '2020-01-10',
    });
    await act(dropped.id, 'cancel', { reason: 'No longer needed' }).expect(200);
    const future = await createOrder({
      customerId: otherCustomer,
      deliveryDate: '2099-01-01',
    });

    const list = async (query: string) =>
      (await owner.get(`/sales-orders?${query}`).expect(200)).body.items.map(
        (o: { id: string }) => o.id,
      );

    expect(await list('late=true')).toEqual([overdue.id]);
    expect(await list('status=DRAFT')).toEqual([future.id]);
    expect(await list(`customerId=${otherCustomer}`)).toEqual([future.id]);
    expect(await list('deliveryFrom=2030-01-01')).toEqual([future.id]);
    expect(await list('deliveryTo=2020-12-31')).toHaveLength(3);
    expect(await list('search=po-old')).toEqual([overdue.id]);
    expect(await list(`search=${future.number}`)).toEqual([future.id]);
  });

  it('marks open orders past their delivery date as late', async () => {
    const overdue = await confirmed({
      orderDate: '2020-01-01',
      deliveryDate: '2020-01-10',
    });
    const closed = await confirmed({
      orderDate: '2020-01-01',
      deliveryDate: '2020-01-10',
    });
    await act(closed.id, 'start-production').expect(200);
    await act(closed.id, 'close-short', { reason: 'Done' }).expect(200);
    const future = await createOrder({ deliveryDate: '2099-01-01' });
    const late = async (id: string) =>
      (await owner.get(`/sales-orders/${id}`).expect(200)).body.late;

    expect(await late(overdue.id)).toBe(true);
    expect(await late(closed.id)).toBe(false);
    expect(await late(future.id)).toBe(false);
  });

  it('answers in the shapes the OpenAPI spec promises', async () => {
    const so = await confirmed();
    const read = async (path: string) =>
      (await owner.get(path).expect(200)).body;

    salesOrderResponse.strict().parse(so);
    pageOf(salesOrderResponse.strict()).parse(await read('/sales-orders'));
    salesOrderResponse.strict().parse(await read(`/sales-orders/${so.id}`));
    orderDeliveryResponse
      .strict()
      .parse(await read(`/sales-orders/${so.id}/delivery`));
    materialCheckResponse
      .strict()
      .parse(await read(`/sales-orders/${so.id}/material-check`));
    materialShortagesResponse
      .strict()
      .parse(await read('/sales-orders/material-shortages'));
  });

  it('records the same create once when it is sent twice', async () => {
    const send = () =>
      order().set('Idempotency-Key', 'so-cust-01-oct').expect(201);

    const first = await send();
    const second = await send();

    expect(second.body).toEqual(first.body);
    expect((await owner.get('/sales-orders').expect(200)).body.total).toBe(1);
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const so = await createOrder();
    const api =
      role === Role.OWNER ? owner : apiFor(app, await tokenFor(app, role));
    const read = SALES_READERS.includes(role) ? 200 : 403;
    const edit = SALES_EDITORS.includes(role);

    await api.get('/sales-orders').expect(read);
    await api.get(`/sales-orders/${so.id}`).expect(read);
    await api.get(`/sales-orders/${so.id}/material-check`).expect(read);
    await api.get('/sales-orders/material-shortages').expect(read);
    await api
      .post('/sales-orders')
      .send({
        customerId: customer,
        orderDate: '2026-10-14',
        deliveryDate: '2026-10-30',
        lines: [{ productId: jar, pieces: 10 }],
      })
      .expect(edit ? 201 : 403);
    await api
      .patch(`/sales-orders/${so.id}`)
      .send({ notes: 'Pack in 50s' })
      .expect(edit ? 200 : 403);
    await api.post(`/sales-orders/${so.id}/confirm`).expect(edit ? 200 : 403);
    await api
      .post(`/sales-orders/${so.id}/cancel`)
      .send({ reason: 'Test' })
      .expect(edit ? 200 : 403);
  });
});
