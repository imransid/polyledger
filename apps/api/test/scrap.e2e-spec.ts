import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { factoryToday } from '../src/common/dates.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

const { OWNER, MANAGER, SUPERVISOR, STOREKEEPER } = Role;

// Written out rather than imported, so a wrong role list in the code fails.
const ACCESS = {
  scrapProducts: [OWNER, MANAGER],
  grind: [OWNER, MANAGER, SUPERVISOR, STOREKEEPER],
  reverseGrinding: [OWNER, MANAGER, SUPERVISOR],
  sell: [OWNER, MANAGER],
};

describe('scrap', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: Api;
  let supervisor: Api;
  let storekeeper: Api;
  let pp: string;
  let unground: string;
  let ground: string;
  let cap: string;
  let store: string;
  let floor: string;
  let finishedGoods: string;
  let scrapYard: string;
  const today = factoryToday();

  const created = async (path: string, body: object, api = owner) =>
    (await api.post(path).send(body).expect(201)).body.id as string;

  const scrapProducts = (pieces: number, transfer: object = {}, api = owner) =>
    api.post('/scrap/transfers').send({
      fromLocationId: finishedGoods,
      toLocationId: scrapYard,
      reason: 'DAMAGED',
      lines: [{ productId: cap, pieces }],
      ...transfer,
    });
  const grind = (
    input: object,
    outputKilograms: string,
    batch: object = {},
    api = storekeeper,
  ) =>
    api.post('/scrap/grinding').send({
      scrapLocationId: scrapYard,
      storeLocationId: store,
      input,
      outputMaterialId: ground,
      outputKilograms,
      ...batch,
    });
  const regrindIn = (kilograms: string, itemId = unground) => ({
    itemType: 'RAW_MATERIAL',
    itemId,
    kilograms,
  });
  const reverseGrinding = (id: string, api = supervisor) =>
    api
      .post(`/scrap/grinding/${id}/reverse`)
      .send({ reason: 'Wrong scale reading' });
  const sell = (lines: object[], sale: object = {}, api = owner) =>
    api.post('/scrap/sales').send({
      buyerName: 'Karim Scrap Traders',
      scrapLocationId: scrapYard,
      lines,
      ...sale,
    });
  const regrindLine = (kilograms: string, pricePerKgPoisha: number) => ({
    itemType: 'RAW_MATERIAL',
    itemId: unground,
    kilograms,
    pricePerKgPoisha,
  });
  const reverseSale = (id: string, api = owner) =>
    api.post(`/scrap/sales/${id}/reverse`).send({ reason: 'Buyer backed out' });

  const balance = async (itemId: string, locationId: string) =>
    (
      await owner
        .get(`/stock/balances?itemId=${itemId}&locationId=${locationId}`)
        .expect(200)
    ).body.items[0] ?? { grams: 0, pieces: 0 };
  const documentNumber = async (id: string) =>
    (await owner.get(`/stock/documents/${id}`).expect(200)).body.number;

  beforeEach(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
    supervisor = apiFor(app, await tokenFor(app, Role.SUPERVISOR));
    storekeeper = apiFor(app, await tokenFor(app, Role.STOREKEEPER));

    const material = (code: string, type: string) =>
      created('/raw-materials', {
        code,
        name: code,
        type,
        minimumStockGrams: 0,
      });
    pp = await material('RM-PP-01', 'RESIN');
    unground = await material('RG-PP-SCRAP', 'REGRIND');
    ground = await material('RG-PP-GROUND', 'REGRIND');
    cap = await created('/products', {
      code: 'CAP-28',
      name: 'Bottle cap 28 mm',
      pieceWeightMg: 2_500,
      colour: 'Red',
      piecesPerCarton: 2_000,
    });

    const location = (code: string, kind: string) =>
      created('/locations', { code, name: code, kind });
    store = await location('RM-STORE', 'RAW_MATERIAL_STORE');
    floor = await location('FLOOR', 'PRODUCTION_FLOOR');
    finishedGoods = await location('FG-STORE', 'FINISHED_GOODS_STORE');
    scrapYard = await location('SCRAP', 'SCRAP_YARD');
    await created('/stock/openings', {
      locationId: scrapYard,
      lines: [regrindIn('20')],
    });
    await created('/stock/openings', {
      locationId: finishedGoods,
      lines: [{ itemType: 'PRODUCT', itemId: cap, pieces: 1_000 }],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('scrapping products', () => {
    it('moves finished goods to a scrap yard with a reason, and back on reversal', async () => {
      const document = (await scrapProducts(300).expect(201)).body;

      expect(document).toMatchObject({
        kind: 'SCRAP_TRANSFER',
        reason: 'DAMAGED',
      });
      expect(document.number).toMatch(/^SCT-\d{6}$/);
      expect((await balance(cap, finishedGoods)).pieces).toBe(700);
      expect(await balance(cap, scrapYard)).toMatchObject({
        pieces: 300,
        grams: 750,
      });

      await owner
        .post(`/stock/documents/${document.id}/reverse`)
        .send({ reason: 'Not damaged after all' })
        .expect(201);
      expect((await balance(cap, finishedGoods)).pieces).toBe(1_000);
      expect((await balance(cap, scrapYard)).pieces ?? 0).toBe(0);
    });

    it('needs a reason, a finished goods store, a scrap yard and the stock', async () => {
      const message = async (transfer: object, status = 400, pieces = 10) =>
        (await scrapProducts(pieces, transfer).expect(status)).body.message;

      await scrapProducts(10, { reason: undefined }).expect(400);
      await scrapProducts(10, { reason: 'LOST' }).expect(400);
      expect(await message({ fromLocationId: store })).toBe(
        'Scrap products from an active finished goods store',
      );
      expect(await message({ toLocationId: floor })).toBe(
        'Scrapped products go to an active scrap yard',
      );
      expect(await message({}, 409, 1_001)).toBe('Not enough stock for CAP-28');
    });
  });

  describe('grinding', () => {
    it('grinds regrind into a raw material store and works out the loss', async () => {
      const batch = (await grind(regrindIn('10'), '9.7').expect(201)).body;

      expect(batch).toMatchObject({
        inputItemType: 'RAW_MATERIAL',
        inputItemId: unground,
        inputPieces: null,
        inputGrams: 10_000,
        outputMaterialId: ground,
        outputGrams: 9_700,
        lossGrams: 300,
        groundOn: today,
        reversedAt: null,
      });
      expect(await documentNumber(batch.stockDocumentId)).toMatch(
        /^GRD-\d{6}$/,
      );
      expect((await balance(unground, scrapYard)).grams).toBe(10_000);
      expect((await balance(ground, store)).grams).toBe(9_700);
    });

    it('grinds scrapped products by pieces x piece weight', async () => {
      await scrapProducts(200).expect(201);

      const batch = (
        await grind(
          { itemType: 'PRODUCT', itemId: cap, pieces: 200 },
          '0.48',
        ).expect(201)
      ).body;

      expect(batch).toMatchObject({
        inputItemType: 'PRODUCT',
        inputPieces: 200,
        inputGrams: 500,
        outputGrams: 480,
        lossGrams: 20,
      });
      expect((await balance(cap, scrapYard)).pieces ?? 0).toBe(0);
    });

    it('never makes material, and takes and makes only regrind', async () => {
      const message = async (
        input: object,
        output: string,
        batch: object = {},
        status = 400,
      ) => (await grind(input, output, batch).expect(status)).body.message;

      expect(await message(regrindIn('10'), '10.001')).toBe(
        'The output (10001 g) cannot weigh more than the input (10000 g)',
      );
      expect(await message(regrindIn('1', pp), '1')).toBe(
        'Grinding takes and makes active REGRIND raw materials',
      );
      expect(await message(regrindIn('1'), '1', { outputMaterialId: pp })).toBe(
        'Grinding takes and makes active REGRIND raw materials',
      );
      expect(
        await message(regrindIn('1'), '1', { storeLocationId: scrapYard }),
      ).toBe('Ground regrind goes to an active raw material store');
      expect(
        await message(regrindIn('1'), '1', { scrapLocationId: store }),
      ).toBe('Grind from an active scrap yard');
      expect(await message(regrindIn('20.001'), '1', {}, 409)).toBe(
        'Not enough stock for RG-PP-SCRAP',
      );
      await grind(regrindIn('1'), '0').expect(400);
      expect(await prisma.grindingBatch.count()).toBe(0);
    });

    it('reverses a batch until its ground regrind has moved on', async () => {
      const batch = (await grind(regrindIn('10'), '9.7').expect(201)).body;

      await reverseGrinding(batch.id, storekeeper).expect(403);
      const reversed = (await reverseGrinding(batch.id).expect(201)).body;
      expect(reversed.reversedAt).not.toBeNull();
      expect((await balance(unground, scrapYard)).grams).toBe(20_000);
      expect((await balance(ground, store)).grams).toBe(0);
      expect((await reverseGrinding(batch.id).expect(409)).body.message).toBe(
        'This batch is already reversed',
      );
      const generic = await owner
        .post(`/stock/documents/${batch.stockDocumentId}/reverse`)
        .send({ reason: 'Try' })
        .expect(409);
      expect(generic.body.message).toBe(
        'Grinding batches are reversed from scrap',
      );

      const used = (await grind(regrindIn('5'), '4.9').expect(201)).body;
      await storekeeper
        .post('/stock/transfers')
        .send({
          fromLocationId: store,
          toLocationId: floor,
          lines: [regrindIn('1', ground)],
        })
        .expect(201);
      expect((await reverseGrinding(used.id).expect(409)).body.message).toBe(
        'Not enough stock for RG-PP-GROUND',
      );
      await reverseGrinding(randomUUID()).expect(404);
    });

    it('reports the loss of the batches ground in a date range', async () => {
      await scrapProducts(200).expect(201);
      await grind(regrindIn('10'), '9.7').expect(201);
      await grind(
        { itemType: 'PRODUCT', itemId: cap, pieces: 200 },
        '0.48',
      ).expect(201);
      const reversed = (await grind(regrindIn('5'), '4.9').expect(201)).body;
      await reverseGrinding(reversed.id).expect(201);

      const report = (
        await owner.get(`/scrap/grinding?from=${today}&to=${today}`).expect(200)
      ).body;

      expect(report.totals).toEqual({
        batches: 2,
        inputGrams: 10_500,
        outputGrams: 10_180,
        lossGrams: 320,
        // 320 / 10,500 = 3.05%
        lossBasisPoints: 305,
      });
      expect(report.batches).toHaveLength(3);
      const empty = (
        await owner
          .get('/scrap/grinding?from=2026-01-01&to=2026-01-31')
          .expect(200)
      ).body;
      expect(empty).toEqual({
        totals: {
          batches: 0,
          inputGrams: 0,
          outputGrams: 0,
          lossGrams: 0,
          lossBasisPoints: null,
        },
        batches: [],
      });
    });
  });

  describe('sales', () => {
    it('sells scrap by weight, products as pieces x piece weight', async () => {
      await scrapProducts(100).expect(201);

      const sale = (
        await sell([
          regrindLine('2.345', 4_550),
          {
            itemType: 'PRODUCT',
            itemId: cap,
            pieces: 100,
            pricePerKgPoisha: 2_000,
          },
        ]).expect(201)
      ).body;

      expect(sale).toMatchObject({
        buyerName: 'Karim Scrap Traders',
        soldOn: today,
        // 106.70 + 5.00 BDT
        amountPoisha: 11_170,
        reversedAt: null,
      });
      expect(sale.lines).toEqual([
        expect.objectContaining({
          lineNo: 1,
          itemId: unground,
          pieces: null,
          grams: 2_345,
          pricePerKgPoisha: 4_550,
          // 2.345 kg x 45.50 BDT = 106.6975 BDT
          amountPoisha: 10_670,
        }),
        expect.objectContaining({
          lineNo: 2,
          itemId: cap,
          pieces: 100,
          grams: 250,
          pricePerKgPoisha: 2_000,
          amountPoisha: 500,
        }),
      ]);
      expect(await documentNumber(sale.stockDocumentId)).toMatch(/^SCR-\d{6}$/);
      expect((await balance(unground, scrapYard)).grams).toBe(17_655);
      expect((await balance(cap, scrapYard)).pieces ?? 0).toBe(0);
    });

    it('sells only what is in an active scrap yard', async () => {
      const message = async (lines: object[], sale: object, status = 400) =>
        (await sell(lines, sale).expect(status)).body.message;

      expect(await message([regrindLine('20.001', 4_550)], {}, 409)).toBe(
        'Not enough stock for RG-PP-SCRAP',
      );
      expect(
        await message([regrindLine('1', 4_550)], {
          scrapLocationId: finishedGoods,
        }),
      ).toBe('Sell scrap from an active scrap yard');
      await sell([regrindLine('1', 4_550), regrindLine('2', 4_550)]).expect(
        400,
      );
      await sell([regrindLine('1', -1)]).expect(400);
      await sell([regrindLine('1', 4_550)], { buyerName: ' ' }).expect(400);
      expect(await prisma.scrapSale.count()).toBe(0);
    });

    it('lets only one of two sales that together oversell go through', async () => {
      const responses = await Promise.all([
        sell([regrindLine('12', 4_550)]),
        sell([regrindLine('12', 4_550)]),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await balance(unground, scrapYard)).grams).toBe(8_000);
      expect(await prisma.scrapSale.count()).toBe(1);
    });

    it('reverses a sale and drops it from the totals', async () => {
      await sell([regrindLine('2.345', 4_550)]).expect(201);
      const toReverse = (
        await sell([regrindLine('1', 5_000)], { buyerName: 'Rahim' }).expect(
          201,
        )
      ).body;

      await reverseSale(toReverse.id).expect(201);

      expect((await balance(unground, scrapYard)).grams).toBe(17_655);
      expect((await reverseSale(toReverse.id).expect(409)).body.message).toBe(
        'This sale is already reversed',
      );
      const generic = await owner
        .post(`/stock/documents/${toReverse.stockDocumentId}/reverse`)
        .send({ reason: 'Try' })
        .expect(409);
      expect(generic.body.message).toBe('Scrap sales are reversed from scrap');
      const report = (
        await owner.get(`/scrap/sales?from=${today}&to=${today}`).expect(200)
      ).body;
      expect(report.totals).toEqual({
        sales: 1,
        grams: 2_345,
        amountPoisha: 10_670,
      });
      expect(report.sales).toHaveLength(2);
    });
  });

  it('records the same batch and the same sale once when sent twice', async () => {
    const twice = async (send: () => ReturnType<typeof grind>) => {
      const first = await send().expect(201);
      const second = await send().expect(201);
      expect(second.body).toEqual(first.body);
    };

    await twice(() =>
      grind(regrindIn('10'), '9.7').set('Idempotency-Key', 'grind-1'),
    );
    await twice(() =>
      sell([regrindLine('1', 4_550)]).set('Idempotency-Key', 'sale-1'),
    );

    expect(await prisma.grindingBatch.count()).toBe(1);
    expect(await prisma.scrapSale.count()).toBe(1);
    expect((await balance(unground, scrapYard)).grams).toBe(9_000);
  });

  it('writes outbox events and keeps every ledger sum equal to its balance', async () => {
    await scrapProducts(100).expect(201);
    const batch = (await grind(regrindIn('10'), '9.7').expect(201)).body;
    await reverseGrinding(batch.id).expect(201);
    await grind({ itemType: 'PRODUCT', itemId: cap, pieces: 99 }, '0.2').expect(
      201,
    );
    const sale = (
      await sell([
        regrindLine('3', 4_550),
        { itemType: 'PRODUCT', itemId: cap, pieces: 1, pricePerKgPoisha: 100 },
      ]).expect(201)
    ).body;
    await reverseSale(sale.id).expect(201);

    const types = (await prisma.outboxEvent.findMany()).map(
      (event) => event.type,
    );
    expect(types).toEqual(
      expect.arrayContaining([
        'stock.scrap_transfer.posted',
        'stock.grinding.posted',
        'scrap.ground',
        'scrap.grinding_reversed',
        'stock.scrap_sale.posted',
        'scrap.sold',
        'scrap.sale_reversed',
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
    const batch = (await grind(regrindIn('1'), '1', {}, owner).expect(201))
      .body;
    const sale = (await sell([regrindLine('1', 4_550)]).expect(201)).body;
    const loggedIn: Partial<Record<Role, Api>> = {
      OWNER: owner,
      SUPERVISOR: supervisor,
      STOREKEEPER: storekeeper,
    };
    const api = loggedIn[role] ?? apiFor(app, await tokenFor(app, role));
    const allowed = (roles: Role[], ok: number) =>
      roles.includes(role) ? ok : 403;
    const range = `from=${today}&to=${today}`;

    await scrapProducts(10, {}, api).expect(allowed(ACCESS.scrapProducts, 201));
    await grind(regrindIn('1'), '0.9', {}, api).expect(
      allowed(ACCESS.grind, 201),
    );
    await reverseGrinding(batch.id, api).expect(
      allowed(ACCESS.reverseGrinding, 201),
    );
    await api
      .get(`/scrap/grinding?${range}`)
      .expect(allowed(ACCESS.grind, 200));
    await sell([regrindLine('1', 4_550)], {}, api).expect(
      allowed(ACCESS.sell, 201),
    );
    await reverseSale(sale.id, api).expect(allowed(ACCESS.sell, 201));
    await api.get(`/scrap/sales?${range}`).expect(allowed(ACCESS.sell, 200));
  });
});
