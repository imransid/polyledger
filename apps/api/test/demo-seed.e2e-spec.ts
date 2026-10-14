import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { seedDemo } from '../src/demo/seed-demo.js';
import { Role } from '../src/generated/prisma/client.js';
import { apiFor, createUser, logIn, startApp } from './support.js';

const DEMO_PASSWORD = 'demo password 2026';

describe('demo seed', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await startApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('fills an empty database through the commands, once', async () => {
    await createUser(app, Role.OWNER);
    // Migrations create the default locations; the seed must reuse them.
    const store = await app.get(PrismaService).location.create({
      data: {
        code: 'RM-STORE',
        name: 'Main raw material store',
        kind: 'RAW_MATERIAL_STORE',
      },
    });

    await seedDemo(app, DEMO_PASSWORD);

    const manager = apiFor(
      app,
      (await logIn(app, 'manager@demo.test', DEMO_PASSWORD)).accessToken,
    );
    const orders = (await manager.get('/sales-orders').expect(200)).body.items;
    expect(
      orders.map((order: { status: string }) => order.status).sort(),
    ).toEqual(['CONFIRMED', 'CONFIRMED', 'DRAFT', 'IN_PRODUCTION']);
    const shortages = (
      await manager.get('/stock/receipts/shortages').expect(200)
    ).body;
    expect(JSON.stringify(shortages)).toContain('BPT-CH-5521');
    const prisma = app.get(PrismaService);
    expect(
      await prisma.formulaVersion.count({ where: { isActive: true } }),
    ).toBe(4);
    expect(
      await prisma.stockBalance.count({ where: { locationId: store.id } }),
    ).toBe(6);

    await expect(seedDemo(app, DEMO_PASSWORD)).rejects.toThrow(
      'The database already has data; the demo seed only fills an empty one',
    );
  });

  it('needs an owner to act as', async () => {
    await expect(seedDemo(app, DEMO_PASSWORD)).rejects.toThrow(
      'Create the owner first',
    );
  });
});
