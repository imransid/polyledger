import { z } from 'zod';
import { formulaVersionResponse } from '../src/formulas/responses.js';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ROLES } from '../src/auth/decorators.js';
import {
  MASTER_DATA_EDITORS,
  MASTER_DATA_READERS,
} from '../src/common/master-data.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { startApp, tokenFor } from './support.js';

interface Line {
  rawMaterialId: string;
  basisPoints: number;
}

describe('formulas', () => {
  let app: INestApplication;
  let token: string;
  let productId: string;
  let resin: string;
  let masterbatch: string;
  let additive: string;

  const api = () => request(app.getHttpServer());
  const get = (path: string) => api().get(path).auth(token, { type: 'bearer' });
  const post = (path: string) =>
    api().post(path).auth(token, { type: 'bearer' });

  const standardLines = (): Line[] => [
    { rawMaterialId: resin, basisPoints: 9_750 },
    { rawMaterialId: masterbatch, basisPoints: 200 },
    { rawMaterialId: additive, basisPoints: 50 },
  ];
  const createVersion = (lines = standardLines(), wasteBasisPoints = 350) =>
    post(`/products/${productId}/formulas`).send({ wasteBasisPoints, lines });
  const activate = (id: string) => post(`/formulas/${id}/activate`);
  const versions = async () =>
    (await get(`/products/${productId}/formulas`).expect(200)).body as {
      id: string;
      version: number;
      isActive: boolean;
    }[];
  const activeVersions = async () =>
    (await versions()).filter((v) => v.isActive).map((v) => v.version);

  const createMaterial = async (code: string, type: string) =>
    (
      await post('/raw-materials')
        .send({ code, name: code, type, minimumStockGrams: 0 })
        .expect(201)
    ).body.id;

  beforeEach(async () => {
    app = await startApp();
    token = await tokenFor(app, Role.OWNER);
    productId = (
      await post('/products')
        .send({
          code: 'CAP-28',
          name: 'Bottle cap 28 mm',
          pieceWeightMg: 2_500,
          colour: 'Red',
          piecesPerCarton: 2_000,
        })
        .expect(201)
    ).body.id;
    resin = await createMaterial('RM-PP-01', 'RESIN');
    masterbatch = await createMaterial('MB-RED-01', 'MASTERBATCH');
    additive = await createMaterial('AD-UV-01', 'ADDITIVE');
  });

  afterEach(async () => {
    await app.close();
  });

  it('numbers versions 1, 2, 3 and starts them inactive', async () => {
    const first = (await createVersion().expect(201)).body;
    await createVersion().expect(201);
    await createVersion().expect(201);

    expect(first).toMatchObject({
      version: 1,
      isActive: false,
      wasteBasisPoints: 350,
      lines: standardLines(),
    });
    expect((await versions()).map((v) => v.version)).toEqual([3, 2, 1]);
    expect(await activeVersions()).toEqual([]);
    // What the OpenAPI spec promises the office client.
    const shape = formulaVersionResponse.strict();
    shape.parse(first);
    z.array(shape).parse(await versions());
    shape.parse((await activate(first.id).expect(200)).body);
  });

  it('activating a version deactivates the previous one', async () => {
    const first = (await createVersion().expect(201)).body;
    const second = (await createVersion().expect(201)).body;

    await activate(first.id).expect(200);
    expect(await activeVersions()).toEqual([1]);

    const activated = await activate(second.id).expect(200);
    expect(activated.body).toMatchObject({ version: 2, isActive: true });
    expect(await activeVersions()).toEqual([2]);
  });

  it('can roll back to an older version', async () => {
    const first = (await createVersion().expect(201)).body;
    const second = (await createVersion().expect(201)).body;
    await activate(second.id).expect(200);

    await activate(first.id).expect(200);

    expect(await activeVersions()).toEqual([1]);
  });

  it('keeps exactly one version active when two activations race', async () => {
    const first = (await createVersion().expect(201)).body;
    const second = (await createVersion().expect(201)).body;

    await Promise.all([
      activate(first.id).expect(200),
      activate(second.id).expect(200),
    ]);

    expect(await activeVersions()).toHaveLength(1);
  });

  it('gives simultaneous new versions distinct numbers', async () => {
    const [a, b] = await Promise.all([
      createVersion().expect(201),
      createVersion().expect(201),
    ]);

    expect([a.body.version, b.body.version].sort()).toEqual([1, 2]);
  });

  it('is protected by the database: a second active version is refused', async () => {
    const first = (await createVersion().expect(201)).body;
    const second = (await createVersion().expect(201)).body;
    await activate(first.id).expect(200);

    await expect(
      app.get(PrismaService)
        .$executeRaw`UPDATE formula_versions SET is_active = true WHERE id = ${second.id}::uuid`,
    ).rejects.toThrow(/formula_versions_one_active_per_product/);
  });

  it.each([
    ['lines short of 100%', (l: Line[]) => [l[0], l[1]]],
    [
      'lines over 100%',
      (l: Line[]) => [{ ...l[0], basisPoints: 9_800 }, l[1], l[2]],
    ],
    [
      'a raw material twice',
      (l: Line[]) => [
        { ...l[0], basisPoints: 9_700 },
        { ...l[0], basisPoints: 50 },
        l[1],
        l[2],
      ],
    ],
    [
      'a zero line',
      (l: Line[]) => [l[0], l[1], l[2], { ...l[2], basisPoints: 0 }],
    ],
    ['no lines', () => []],
  ])('rejects %s', async (_case, lines) => {
    await createVersion(lines(standardLines())).expect(400);
  });

  it('rejects unknown or inactive raw materials', async () => {
    const unknown = standardLines();
    unknown[2] = { rawMaterialId: randomUUID(), basisPoints: 50 };
    await createVersion(unknown).expect(400);

    await post(`/raw-materials/${additive}/deactivate`).expect(200);
    await createVersion().expect(400);
  });

  it('will not create or activate a formula for an inactive product', async () => {
    const first = (await createVersion().expect(201)).body;
    await post(`/products/${productId}/deactivate`).expect(200);

    await createVersion().expect(400);
    await activate(first.id).expect(400);
  });

  it('has no way to edit a version', async () => {
    const first = (await createVersion().expect(201)).body;

    await api()
      .patch(`/formulas/${first.id}`)
      .auth(token, { type: 'bearer' })
      .send({ wasteBasisPoints: 100 })
      .expect(404);
  });

  it('replays a repeated Idempotency-Key instead of adding a version', async () => {
    const send = () => createVersion().set('Idempotency-Key', 'cap-28-v1');

    const first = await send().expect(201);
    const second = await send().expect(201);

    expect(second.body).toEqual(first.body);
    expect(await versions()).toHaveLength(1);
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const existing = (await createVersion().expect(201)).body;
    const roleToken = role === Role.OWNER ? token : await tokenFor(app, role);
    const as = (method: 'get' | 'post', path: string) =>
      api()[method](path).auth(roleToken, { type: 'bearer' });
    const canRead = MASTER_DATA_READERS.includes(role);
    const canEdit = MASTER_DATA_EDITORS.includes(role);

    await as('get', `/products/${productId}/formulas`).expect(
      canRead ? 200 : 403,
    );
    await as('get', `/formulas/${existing.id}`).expect(canRead ? 200 : 403);
    await as('post', `/products/${productId}/formulas`)
      .send({ wasteBasisPoints: 350, lines: standardLines() })
      .expect(canEdit ? 201 : 403);
    await as('post', `/formulas/${existing.id}/activate`).expect(
      canEdit ? 200 : 403,
    );
  });
});
