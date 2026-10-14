import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { pageOf } from '../src/common/list-query.js';
import {
  MASTER_DATA_EDITORS,
  MASTER_DATA_READERS,
} from '../src/common/master-data.js';
import { customerResponse } from '../src/customers/responses.js';
import { Role } from '../src/generated/prisma/client.js';
import { machineResponse } from '../src/machines/responses.js';
import { rawMaterialResponse } from '../src/materials/responses.js';
import { mouldResponse } from '../src/moulds/responses.js';
import { productResponse } from '../src/products/responses.js';
import { locationResponse } from '../src/stock/responses.js';
import { supplierResponse } from '../src/suppliers/responses.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

// Operators read products and moulds on the tablet; the gate guard doesn't.
const FLOOR_READERS = [...MASTER_DATA_READERS, Role.OPERATOR];

let productCount = 0;

async function createProduct(api: Api) {
  productCount += 1;
  const response = await api
    .post('/products')
    .send({
      code: `P-${productCount}`,
      name: 'Bottle cap 28 mm',
      pieceWeightMg: 2_500,
      colour: 'Red',
      piecesPerCarton: 2_000,
    })
    .expect(201);
  return response.body;
}

interface Resource {
  path: string;
  readers: readonly Role[];
  fields: (owner: Api) => Promise<Record<string, unknown>>;
  change: Record<string, unknown>;
  retiredBy: 'deactivate' | 'status';
  /** What the OpenAPI spec promises, for resources the office app shows. */
  response?: z.ZodObject;
}

const resources: Resource[] = [
  {
    path: '/raw-materials',
    readers: MASTER_DATA_READERS,
    fields: async () => ({
      name: 'Polypropylene homopolymer',
      type: 'RESIN',
      minimumStockGrams: 500_000,
    }),
    change: { minimumStockGrams: 750_000 },
    retiredBy: 'deactivate',
    response: rawMaterialResponse,
  },
  {
    path: '/products',
    readers: FLOOR_READERS,
    fields: async () => ({
      name: 'Bottle cap 28 mm',
      pieceWeightMg: 2_500,
      colour: 'Red',
      piecesPerCarton: 2_000,
    }),
    change: { colour: 'Blue' },
    retiredBy: 'deactivate',
    response: productResponse,
  },
  {
    path: '/moulds',
    readers: FLOOR_READERS,
    fields: async (owner) => ({
      name: '4-cavity cap mould',
      cavities: 4,
      cycleTimeTenths: 125,
      productId: (await createProduct(owner)).id,
    }),
    change: { cycleTimeTenths: 118 },
    retiredBy: 'status',
    response: mouldResponse,
  },
  {
    path: '/machines',
    readers: MASTER_DATA_READERS,
    fields: async () => ({ name: 'Haitian MA1600', tonnage: 160 }),
    change: { tonnage: 180 },
    retiredBy: 'status',
    response: machineResponse,
  },
  {
    path: '/customers',
    readers: MASTER_DATA_READERS,
    fields: async () => ({
      name: 'Dhaka Traders',
      phone: '+8801712345678',
      address: 'Tejgaon, Dhaka',
    }),
    change: { address: 'Gulshan, Dhaka' },
    retiredBy: 'deactivate',
    response: customerResponse,
  },
  {
    path: '/locations',
    readers: MASTER_DATA_READERS,
    fields: async () => ({
      name: 'Second raw material store',
      kind: 'RAW_MATERIAL_STORE',
    }),
    change: { name: 'Store B' },
    retiredBy: 'deactivate',
    response: locationResponse,
  },
  {
    path: '/suppliers',
    readers: MASTER_DATA_READERS,
    fields: async () => ({
      name: 'Chittagong Polymers',
      phone: '+8801812345678',
      address: 'Agrabad, Chattogram',
    }),
    change: { address: 'Halishahar, Chattogram' },
    retiredBy: 'deactivate',
    response: supplierResponse,
  },
];

describe.each(resources)('$path', (resource) => {
  let app: INestApplication;
  let owner: Api;
  const { path } = resource;

  // Built before the request starts: mould fields create a product over HTTP.
  const bodyFor = async (code: string) => ({
    code,
    ...(await resource.fields(owner)),
  });

  const create = async (code: string) => {
    const body = await bodyFor(code);
    return (await owner.post(path).send(body).expect(201)).body;
  };

  const retire = (id: string) =>
    resource.retiredBy === 'deactivate'
      ? owner.post(`${path}/${id}/deactivate`).expect(200)
      : owner.patch(`${path}/${id}`).send({ status: 'RETIRED' }).expect(200);

  const retiredFilter =
    resource.retiredBy === 'deactivate' ? 'active=false' : 'status=RETIRED';

  beforeEach(async () => {
    app = await startApp();
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates, reads and lists a record with its code in upper case', async () => {
    const { code: _code, ...fields } = await bodyFor(' ab-01 ');
    const created = (
      await owner
        .post(path)
        .send({ code: ' ab-01 ', ...fields })
        .expect(201)
    ).body;

    expect(created).toMatchObject({ code: 'AB-01', ...fields });
    await owner.get(`${path}/${created.id}`).expect(200, created);
    const list = (await owner.get(path).expect(200)).body;
    expect(list.items.map((item: { id: string }) => item.id)).toContain(
      created.id,
    );
  });

  it.skipIf(!resource.response)(
    'answers in the shapes the OpenAPI spec promises',
    async () => {
      const shape = resource.response!.strict();
      const created = await create('AB-01');
      const item = `${path}/${created.id}`;

      shape.parse(created);
      shape.parse((await owner.get(item).expect(200)).body);
      pageOf(shape).parse((await owner.get(path).expect(200)).body);
      shape.parse(
        (await owner.patch(item).send(resource.change).expect(200)).body,
      );
      shape.parse((await retire(created.id)).body);
    },
  );

  it('never reuses a code, even after the record is retired', async () => {
    const created = await create('AB-01');

    const sameBody = await bodyFor('AB-01');
    const duplicate = await owner.post(path).send(sameBody).expect(409);
    expect(duplicate.body.message).toBe('Code AB-01 is already in use');

    await retire(created.id);
    const sameCode = await bodyFor('ab-01');
    await owner.post(path).send(sameCode).expect(409);
  });

  it('updates fields but never the code', async () => {
    const created = await create('AB-01');

    const updated = await owner
      .patch(`${path}/${created.id}`)
      .send(resource.change)
      .expect(200);
    expect(updated.body).toMatchObject({ code: 'AB-01', ...resource.change });

    await owner
      .patch(`${path}/${created.id}`)
      .send({ code: 'XY-01' })
      .expect(400);
  });

  it('rejects malformed codes', async () => {
    for (const code of ['AB_01', 'AB--01', '-AB', 'A'.repeat(21), '']) {
      const body = await bodyFor(code);
      await owner.post(path).send(body).expect(400);
    }
  });

  it('searches, filters and pages', async () => {
    await create('AB-01');
    await create('AB-02');
    const other = await create('CD-01');
    await retire(other.id);

    const search = (await owner.get(`${path}?search=ab`).expect(200)).body;
    expect(search.total).toBe(2);

    const retired = (await owner.get(`${path}?${retiredFilter}`).expect(200))
      .body;
    expect(retired.items.map((item: { code: string }) => item.code)).toEqual([
      'CD-01',
    ]);

    const secondPage = (
      await owner.get(`${path}?pageSize=2&page=2`).expect(200)
    ).body;
    expect(secondPage).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(secondPage.items.map((item: { code: string }) => item.code)).toEqual(
      ['CD-01'],
    );
  });

  it('replays a repeated Idempotency-Key instead of creating twice', async () => {
    const body = await bodyFor('AB-01');
    const send = () =>
      owner.post(path).set('Idempotency-Key', 'create-ab-01').send(body);

    const first = await send().expect(201);
    const second = await send().expect(201);

    expect(second.body).toEqual(first.body);
    expect((await owner.get(path).expect(200)).body.total).toBe(1);
  });

  it('answers 404 for an unknown id', async () => {
    const id = randomUUID();

    await owner.get(`${path}/${id}`).expect(404);
    await owner.patch(`${path}/${id}`).send(resource.change).expect(404);
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const existing = await create('AB-01');
    const api =
      role === Role.OWNER ? owner : apiFor(app, await tokenFor(app, role));
    const canRead = resource.readers.includes(role);
    const canEdit = MASTER_DATA_EDITORS.includes(role);
    const newRecord = await bodyFor('NEW-01');

    await api.get(path).expect(canRead ? 200 : 403);
    await api.get(`${path}/${existing.id}`).expect(canRead ? 200 : 403);
    await api
      .post(path)
      .send(newRecord)
      .expect(canEdit ? 201 : 403);
    await api
      .patch(`${path}/${existing.id}`)
      .send(resource.change)
      .expect(canEdit ? 200 : 403);
  });
});

describe.each([
  '/raw-materials',
  '/products',
  '/customers',
  '/suppliers',
  '/locations',
])('%s', (path) => {
  let app: INestApplication;
  let owner: Api;

  beforeEach(async () => {
    app = await startApp();
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
  });

  afterEach(async () => {
    await app.close();
  });

  it('deactivates and reactivates', async () => {
    const resource = resources.find((r) => r.path === path)!;
    const body = { code: 'AB-01', ...(await resource.fields(owner)) };
    const created = (await owner.post(path).send(body).expect(201)).body;

    const deactivated = await owner
      .post(`${path}/${created.id}/deactivate`)
      .expect(200);
    expect(deactivated.body.isActive).toBe(false);

    const reactivated = await owner
      .post(`${path}/${created.id}/reactivate`)
      .expect(200);
    expect(reactivated.body.isActive).toBe(true);
  });
});

describe.each(['/customers', '/suppliers'])('%s phone numbers', (path) => {
  let app: INestApplication;
  let owner: Api;
  const contact = { name: 'Rahim', address: 'Mirpur, Dhaka' };

  beforeEach(async () => {
    app = await startApp();
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
  });

  afterEach(async () => {
    await app.close();
  });

  it('stores a local number in +880 form', async () => {
    const response = await owner
      .post(path)
      .send({ code: 'C-01', phone: '01712345678', ...contact })
      .expect(201);

    expect(response.body.phone).toBe('+8801712345678');
  });

  it.each(['1712345678', '+880 1712345678', '0171-2345678', ''])(
    'rejects %j',
    async (phone) => {
      await owner
        .post(path)
        .send({ code: 'C-01', phone, ...contact })
        .expect(400);
    },
  );
});

describe('/moulds', () => {
  let app: INestApplication;
  let owner: Api;

  beforeEach(async () => {
    app = await startApp();
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
  });

  afterEach(async () => {
    await app.close();
  });

  const mould = (productId: string) => ({
    code: 'M-01',
    name: '4-cavity cap mould',
    cavities: 4,
    cycleTimeTenths: 125,
    productId,
  });

  it('needs an existing, active product', async () => {
    await owner.post('/moulds').send(mould(randomUUID())).expect(400);

    const product = await createProduct(owner);
    await owner.post(`/products/${product.id}/deactivate`).expect(200);
    await owner.post('/moulds').send(mould(product.id)).expect(400);
  });

  it('checks the product when moving a mould to another one', async () => {
    const product = await createProduct(owner);
    const created = (
      await owner.post('/moulds').send(mould(product.id)).expect(201)
    ).body;
    const retiredProduct = await createProduct(owner);
    await owner.post(`/products/${retiredProduct.id}/deactivate`).expect(200);

    await owner
      .patch(`/moulds/${created.id}`)
      .send({ productId: retiredProduct.id })
      .expect(400);
    await owner
      .patch(`/moulds/${created.id}`)
      .send({ status: 'REPAIR' })
      .expect(200);
  });

  it('keeps a runner weight per shot, 0 for a hot runner, through other edits', async () => {
    const product = await createProduct(owner);
    const hot = (
      await owner.post('/moulds').send(mould(product.id)).expect(201)
    ).body;
    expect(hot.runnerWeightMg).toBe(0);

    const cold = (
      await owner
        .post('/moulds')
        .send({ ...mould(product.id), code: 'M-02', runnerWeightMg: 1_500 })
        .expect(201)
    ).body;
    const edited = await owner
      .patch(`/moulds/${cold.id}`)
      .send({ cavities: 2 })
      .expect(200);

    expect(edited.body).toMatchObject({ cavities: 2, runnerWeightMg: 1_500 });
  });
});
