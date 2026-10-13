import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import {
  STOCK_MANAGERS,
  STOCK_READERS,
  STORE_STAFF,
} from '../src/stock/roles.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

const rm = (itemId: string, kilograms: string) => ({
  itemType: 'RAW_MATERIAL',
  itemId,
  kilograms,
});
const pcs = (itemId: string, pieces: number) => ({
  itemType: 'PRODUCT',
  itemId,
  pieces,
});

describe('stock ledger', () => {
  let app: INestApplication;
  let owner: Api;
  let prisma: PrismaService;
  let supplier: string;
  let otherSupplier: string;
  let resin: string;
  let masterbatch: string;
  let cap: string;
  let store: string;
  let floor: string;
  let finishedGoods: string;

  const created = async (path: string, body: object) =>
    (await owner.post(path).send(body).expect(201)).body.id as string;

  let challans = 0;
  const receive = (
    lines: [string, string, string][],
    options: {
      reference?: string;
      supplierId?: string;
      receivedOn?: string;
    } = {},
  ) =>
    owner.post('/stock/receipts').send({
      supplierId: options.supplierId ?? supplier,
      supplierReference: options.reference ?? `CH-${++challans}`,
      receivedOn: options.receivedOn ?? '2026-10-13',
      locationId: store,
      lines: lines.map(
        ([rawMaterialId, challanKilograms, receivedKilograms]) => ({
          rawMaterialId,
          challanKilograms,
          receivedKilograms,
        }),
      ),
    });

  const transfer = (from: string, to: string, lines: object[], api = owner) =>
    api
      .post('/stock/transfers')
      .send({ fromLocationId: from, toLocationId: to, lines });

  const reverse = (documentId: string) =>
    owner
      .post(`/stock/documents/${documentId}/reverse`)
      .send({ reason: 'Entered by mistake' });

  const balanceOf = async (itemId: string, locationId: string) => {
    const page = (
      await owner
        .get(`/stock/balances?itemId=${itemId}&locationId=${locationId}`)
        .expect(200)
    ).body;
    return page.items[0] ?? { grams: 0, pieces: null };
  };

  const count = (table: 'documents' | 'ledger' | 'outbox') =>
    ({
      documents: () => prisma.stockDocument.count(),
      ledger: () => prisma.stockLedgerEntry.count(),
      outbox: () => prisma.outboxEvent.count(),
    })[table]();

  beforeEach(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
    const partner = (code: string) => ({
      code,
      name: `Supplier ${code}`,
      phone: '01712345678',
      address: 'Narayanganj',
    });
    supplier = await created('/suppliers', partner('SUP-01'));
    otherSupplier = await created('/suppliers', partner('SUP-02'));
    resin = await created('/raw-materials', {
      code: 'RM-PP-01',
      name: 'PP homopolymer',
      type: 'RESIN',
      minimumStockGrams: 1_000_000,
    });
    masterbatch = await created('/raw-materials', {
      code: 'MB-RED-01',
      name: 'Red masterbatch',
      type: 'MASTERBATCH',
      minimumStockGrams: 0,
    });
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
  });

  afterEach(async () => {
    await app.close();
  });

  describe('goods receipts', () => {
    it('puts the received kilograms into stock and keeps the challan figure', async () => {
      const grn = (await receive([[resin, '1000', '998.5']]).expect(201)).body;

      expect(grn.number).toMatch(/^GRN-\d{6}$/);
      expect(grn.entries).toMatchObject([
        { movementType: 'RECEIPT', grams: 998_500, pieces: null },
      ]);
      expect(grn.receiptLines).toMatchObject([
        { challanGrams: 1_000_000, receivedGrams: 998_500 },
      ]);
      expect((await balanceOf(resin, store)).grams).toBe(998_500);
    });

    it.each(['1,000', '12.3456', '-5', '1e3', ''])(
      'rejects the quantity %j',
      async (kilograms) => {
        await receive([[resin, kilograms, kilograms]]).expect(400);
      },
    );

    it('only goes into a raw material store', async () => {
      const response = await owner
        .post('/stock/receipts')
        .send({
          supplierId: supplier,
          supplierReference: 'CH-1',
          receivedOn: '2026-10-13',
          locationId: floor,
          lines: [
            {
              rawMaterialId: resin,
              challanKilograms: '1',
              receivedKilograms: '1',
            },
          ],
        })
        .expect(400);

      expect(response.body.message).toBe(
        'Goods receipts go into a raw material store',
      );
    });

    it('refuses the same challan twice from one supplier until the first GRN is reversed', async () => {
      const first = (
        await receive([[resin, '10', '10']], { reference: 'ch-77' }).expect(201)
      ).body;

      const duplicate = await receive([[resin, '10', '10']], {
        reference: 'CH-77',
      }).expect(409);
      expect(duplicate.body.message).toBe(
        'Challan CH-77 from this supplier is already received',
      );
      await receive([[resin, '10', '10']], {
        reference: 'CH-77',
        supplierId: otherSupplier,
      }).expect(201);

      await reverse(first.id).expect(201);
      await receive([[resin, '10', '10']], { reference: 'CH-77' }).expect(201);
    });

    it('needs active materials', async () => {
      await owner.post(`/raw-materials/${resin}/deactivate`).expect(200);

      const response = await receive([[resin, '10', '10']]).expect(400);

      expect(response.body.message).toBe('RM-PP-01 is inactive');
    });
  });

  it('lists shortages per supplier and date range, leaving out reversed receipts', async () => {
    await receive(
      [
        [resin, '1000', '990'],
        [masterbatch, '25', '25'],
      ],
      { receivedOn: '2026-10-01' },
    ).expect(201);
    await receive([[resin, '500', '480']], {
      supplierId: otherSupplier,
      receivedOn: '2026-10-05',
    }).expect(201);
    const reversed = (
      await receive([[resin, '100', '95']], {
        receivedOn: '2026-10-10',
      }).expect(201)
    ).body;
    await reverse(reversed.id).expect(201);
    await receive([[resin, '100', '101']], { receivedOn: '2026-10-11' }).expect(
      201,
    );

    const shortages = async (query: string) =>
      (await owner.get(`/stock/receipts/shortages${query}`).expect(200)).body;

    const forSupplier = await shortages(`?supplierId=${supplier}`);
    expect(forSupplier.items).toMatchObject([
      { rawMaterialId: resin, receivedOn: '2026-10-01', shortGrams: 10_000 },
    ]);
    expect(forSupplier.totalShortGrams).toBe(10_000);

    const inRange = await shortages('?from=2026-10-02&to=2026-10-31');
    expect(inRange.items).toMatchObject([{ supplierId: otherSupplier }]);
    expect(inRange.totalShortGrams).toBe(20_000);

    expect((await shortages('')).totalShortGrams).toBe(30_000);
  });

  describe('transfers', () => {
    beforeEach(async () => {
      await receive([[resin, '1000', '1000']]).expect(201);
    });

    it('moves stock between locations in one document', async () => {
      const document = (
        await transfer(store, floor, [rm(resin, '250')]).expect(201)
      ).body;

      expect(document.number).toMatch(/^TRF-\d{6}$/);
      expect(document.entries).toMatchObject([
        { locationId: store, grams: -250_000 },
        { locationId: floor, grams: 250_000 },
      ]);
      expect((await balanceOf(resin, store)).grams).toBe(750_000);
      expect((await balanceOf(resin, floor)).grams).toBe(250_000);
    });

    it('refuses to overdraw and writes nothing', async () => {
      const before = await Promise.all([
        count('documents'),
        count('ledger'),
        count('outbox'),
      ]);

      const response = await transfer(store, floor, [
        rm(resin, '1000.001'),
      ]).expect(409);

      expect(response.body.message).toBe('Not enough stock for RM-PP-01');
      expect(
        await Promise.all([
          count('documents'),
          count('ledger'),
          count('outbox'),
        ]),
      ).toEqual(before);
      expect((await balanceOf(resin, store)).grams).toBe(1_000_000);
    });

    it('two concurrent transfers cannot overdraw stock', async () => {
      const responses = await Promise.all([
        transfer(store, floor, [rm(resin, '600')]),
        transfer(store, floor, [rm(resin, '600')]),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await balanceOf(resin, store)).grams).toBe(400_000);
      expect((await balanceOf(resin, floor)).grams).toBe(600_000);
    });

    it('does not deadlock when transfers run both ways at once', async () => {
      await transfer(store, floor, [rm(resin, '500')]).expect(201);

      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          i % 2 === 0
            ? transfer(store, floor, [rm(resin, '10')])
            : transfer(floor, store, [rm(resin, '10')]),
        ),
      );

      expect(responses.map((r) => r.status)).toEqual(Array(6).fill(201));
      expect((await balanceOf(resin, store)).grams).toBe(500_000);
    });

    it('keeps products out of raw material stores and raw materials out of finished goods', async () => {
      await owner
        .post('/stock/openings')
        .send({ locationId: floor, lines: [pcs(cap, 100)] })
        .expect(201);

      const product = await transfer(floor, store, [pcs(cap, 10)]).expect(400);
      expect(product.body.message).toBe(
        'Products cannot be stored in a raw material store',
      );
      const material = await transfer(store, finishedGoods, [
        rm(resin, '1'),
      ]).expect(400);
      expect(material.body.message).toBe(
        'Raw materials cannot be stored in a finished goods store',
      );
    });
  });

  describe('adjustments', () => {
    it('posts the difference to the counted quantity', async () => {
      await receive([[resin, '1000', '1000']]).expect(201);

      const adjustment = (
        await owner
          .post('/stock/adjustments')
          .send({
            locationId: store,
            reason: 'Monthly count',
            lines: [rm(resin, '990.5')],
          })
          .expect(201)
      ).body;

      expect(adjustment.number).toMatch(/^ADJ-\d{6}$/);
      expect(adjustment.entries).toMatchObject([{ grams: -9_500 }]);
      expect((await balanceOf(resin, store)).grams).toBe(990_500);
    });

    it('needs a reason', async () => {
      await owner
        .post('/stock/adjustments')
        .send({ locationId: store, reason: ' ', lines: [rm(resin, '1')] })
        .expect(400);
    });
  });

  describe('opening stock', () => {
    const open = (locationId: string, lines: object[]) =>
      owner.post('/stock/openings').send({ locationId, lines });

    it('allows one opening per item and location until it is reversed', async () => {
      const first = (await open(store, [rm(resin, '500')]).expect(201)).body;
      expect(first.number).toMatch(/^OPN-\d{6}$/);

      const again = await open(store, [rm(resin, '400')]).expect(409);
      expect(again.body.message).toBe(
        'RM-PP-01 already has opening stock at RM-STORE',
      );
      await open(floor, [rm(resin, '20')]).expect(201);

      await reverse(first.id).expect(201);
      await open(store, [rm(resin, '400')]).expect(201);
      expect((await balanceOf(resin, store)).grams).toBe(400_000);
    });

    it('keeps product grams in step with the pieces', async () => {
      const opening = (await open(finishedGoods, [pcs(cap, 3)]).expect(201))
        .body;
      expect(opening.entries).toMatchObject([{ pieces: 3, grams: 8 }]);

      const moved = (
        await transfer(finishedGoods, floor, [pcs(cap, 1)]).expect(201)
      ).body;

      expect(moved.entries).toMatchObject([
        { locationId: finishedGoods, pieces: -1, grams: -3 },
        { locationId: floor, pieces: 1, grams: 3 },
      ]);
      expect(await balanceOf(cap, finishedGoods)).toMatchObject({
        pieces: 2,
        grams: 5,
      });
    });
  });

  describe('reversals', () => {
    it('brings balances back exactly', async () => {
      const grn = (await receive([[resin, '1300', '1234.567']]).expect(201))
        .body;
      const moved = (
        await transfer(store, floor, [rm(resin, '200')]).expect(201)
      ).body;

      const reversal = (await reverse(moved.id).expect(201)).body;

      expect(reversal.number).toMatch(/^REV-\d{6}$/);
      expect(reversal.reversesId).toBe(moved.id);
      expect(
        reversal.entries.map((e: { reversalOfId: number }) => e.reversalOfId),
      ).toEqual(moved.entries.map((e: { id: number }) => e.id));
      expect((await balanceOf(resin, store)).grams).toBe(1_234_567);
      expect((await balanceOf(resin, floor)).grams).toBe(0);

      await reverse(grn.id).expect(201);
      expect((await balanceOf(resin, store)).grams).toBe(0);
      const original = (
        await owner.get(`/stock/documents/${grn.id}`).expect(200)
      ).body;
      expect(original.reversedAt).not.toBeNull();
    });

    it('reverses a document once, and never a reversal', async () => {
      const grn = (await receive([[resin, '10', '10']]).expect(201)).body;
      const reversal = (await reverse(grn.id).expect(201)).body;

      const twice = await reverse(grn.id).expect(409);
      expect(twice.body.message).toBe(`${grn.number} is already reversed`);
      const ofReversal = await reverse(reversal.id).expect(409);
      expect(ofReversal.body.message).toBe('A reversal cannot be reversed');
    });

    it('refuses to reverse a receipt whose stock has moved on', async () => {
      const grn = (await receive([[resin, '100', '100']]).expect(201)).body;
      await transfer(store, floor, [rm(resin, '60')]).expect(201);

      const response = await reverse(grn.id).expect(409);

      expect(response.body.message).toBe('Not enough stock for RM-PP-01');
      expect((await balanceOf(resin, store)).grams).toBe(40_000);
    });
  });

  describe('ledger integrity', () => {
    it('the ledger sum always equals the balance', async () => {
      const grn = (
        await receive([
          [resin, '1000', '999.999'],
          [masterbatch, '50', '49.5'],
        ]).expect(201)
      ).body;
      // Only 999.999 kg: whichever of 300 and 800 kg comes second is refused.
      await Promise.all([
        transfer(store, floor, [rm(resin, '300'), rm(masterbatch, '10')]),
        transfer(store, floor, [rm(resin, '800')]),
        transfer(store, floor, [rm(resin, '0.001')]),
      ]);
      await owner
        .post('/stock/adjustments')
        .send({
          locationId: floor,
          reason: 'Count',
          lines: [rm(masterbatch, '9.75')],
        })
        .expect(201);
      await owner
        .post('/stock/openings')
        .send({ locationId: finishedGoods, lines: [pcs(cap, 1_001)] })
        .expect(201);
      await transfer(finishedGoods, floor, [pcs(cap, 333)]).expect(201);
      const back = (
        await transfer(floor, store, [rm(resin, '0.001')]).expect(201)
      ).body;
      await reverse(back.id).expect(201);
      await reverse(grn.id); // refused or not, the totals must still agree

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
      expect(await count('ledger')).toBeGreaterThan(10);
    });

    it('UPDATE, DELETE and TRUNCATE on stock_ledger are refused by the database', async () => {
      await receive([[resin, '10', '10']]).expect(201);

      await expect(
        prisma.$executeRaw`UPDATE stock_ledger SET grams = grams + 1`,
      ).rejects.toThrow(/stock_ledger is append-only/);
      await expect(
        prisma.$executeRaw`DELETE FROM stock_ledger`,
      ).rejects.toThrow(/stock_ledger is append-only/);
      await expect(
        prisma.$executeRaw`TRUNCATE stock_ledger CASCADE`,
      ).rejects.toThrow(/stock_ledger is append-only/);
      expect(await count('ledger')).toBe(1);
    });

    it('a balance can never go below zero, even by hand', async () => {
      await receive([[resin, '10', '10']]).expect(201);

      await expect(
        prisma.$executeRaw`UPDATE stock_balances SET grams = -1`,
      ).rejects.toThrow(/stock_balances_not_negative/);
    });
  });

  describe('idempotency', () => {
    const body = () => ({
      supplierId: supplier,
      supplierReference: 'CH-500',
      receivedOn: '2026-10-13',
      locationId: store,
      lines: [
        {
          rawMaterialId: resin,
          challanKilograms: '100',
          receivedKilograms: '100',
        },
      ],
    });
    const send = () =>
      owner
        .post('/stock/receipts')
        .set('Idempotency-Key', 'grn-ch-500')
        .send(body());

    it('records the same command once when it is sent twice', async () => {
      const first = await send().expect(201);
      const second = await send().expect(201);

      expect(second.body).toEqual(first.body);
      expect([
        await count('documents'),
        await count('ledger'),
        await count('outbox'),
      ]).toEqual([1, 1, 1]);
      expect((await balanceOf(resin, store)).grams).toBe(100_000);
    });

    it('records the same command once when both copies arrive together', async () => {
      const [a, b] = await Promise.all([send(), send()]);

      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body).toEqual(b.body);
      expect(await count('ledger')).toBe(1);
    });
  });

  it('writes one outbox event per posting', async () => {
    const grn = (await receive([[resin, '10', '10']]).expect(201)).body;
    await reverse(grn.id).expect(201);

    const events = await prisma.outboxEvent.findMany({
      orderBy: { occurredAt: 'asc' },
    });

    expect(events.map((e) => e.type)).toEqual([
      'stock.receipt.posted',
      'stock.reversal.posted',
    ]);
    expect(events[0].payload).toMatchObject({
      documentId: grn.id,
      number: grn.number,
      entries: [{ itemId: resin, locationId: store, grams: 10_000 }],
    });
    expect(events.every((e) => e.publishedAt === null)).toBe(true);
  });

  describe('reports', () => {
    it('shows a stock card with a running balance, newest first', async () => {
      await receive([[resin, '100', '100']]).expect(201);
      await transfer(store, floor, [rm(resin, '30')]).expect(201);
      await receive([[resin, '50', '50']]).expect(201);

      const card = (
        await owner
          .get(
            `/stock/card?itemType=RAW_MATERIAL&itemId=${resin}&locationId=${store}`,
          )
          .expect(200)
      ).body;
      expect(card.total).toBe(3);
      expect(
        card.items.map((l: { grams: number; balanceGrams: number }) => [
          l.grams,
          l.balanceGrams,
        ]),
      ).toEqual([
        [50_000, 120_000],
        [-30_000, 70_000],
        [100_000, 100_000],
      ]);

      const everywhere = (
        await owner
          .get(
            `/stock/card?itemType=RAW_MATERIAL&itemId=${resin}&pageSize=2&page=2`,
          )
          .expect(200)
      ).body;
      expect(everywhere.total).toBe(4);
      expect(
        everywhere.items.map((l: { balanceGrams: number }) => l.balanceGrams),
      ).toEqual([70_000, 100_000]);
    });

    it('lists low stock against each minimum, counting raw material stores only', async () => {
      const additive = await created('/raw-materials', {
        code: 'AD-UV-01',
        name: 'UV additive',
        type: 'ADDITIVE',
        minimumStockGrams: 50_000,
      });
      await receive([
        [resin, '1200', '1200'],
        [masterbatch, '5', '5'],
      ]).expect(201);
      await transfer(store, floor, [rm(resin, '300')]).expect(201);

      const low = (await owner.get('/stock/low-stock').expect(200)).body;

      expect(low).toEqual([
        expect.objectContaining({
          rawMaterialId: additive,
          stockGrams: 0,
          shortByGrams: 50_000,
        }),
        expect.objectContaining({
          rawMaterialId: resin,
          stockGrams: 900_000,
          shortByGrams: 100_000,
        }),
      ]);
    });
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    await receive([[resin, '100', '100']]).expect(201);
    const toReverse = (await receive([[masterbatch, '1', '1']]).expect(201))
      .body;
    const api =
      role === Role.OWNER ? owner : apiFor(app, await tokenFor(app, role));
    const expect201 = (allowed: Role[]) => (allowed.includes(role) ? 201 : 403);

    await api
      .get('/stock/balances')
      .expect(STOCK_READERS.includes(role) ? 200 : 403);
    await api
      .get('/stock/low-stock')
      .expect(STOCK_READERS.includes(role) ? 200 : 403);
    await api
      .post('/stock/receipts')
      .send({
        supplierId: supplier,
        supplierReference: `CH-${role}`,
        receivedOn: '2026-10-13',
        locationId: store,
        lines: [
          {
            rawMaterialId: resin,
            challanKilograms: '1',
            receivedKilograms: '1',
          },
        ],
      })
      .expect(expect201(STORE_STAFF));
    await transfer(store, floor, [rm(resin, '1')], api).expect(
      expect201(STORE_STAFF),
    );
    await api
      .post('/stock/adjustments')
      .send({ locationId: store, reason: 'Count', lines: [rm(resin, '50')] })
      .expect(expect201(STOCK_MANAGERS));
    await api
      .post('/stock/openings')
      .send({ locationId: floor, lines: [rm(masterbatch, '1')] })
      .expect(expect201(STOCK_MANAGERS));
    await api
      .post(`/stock/documents/${toReverse.id}/reverse`)
      .send({ reason: 'Wrong supplier' })
      .expect(expect201(STOCK_MANAGERS));
  });
});
