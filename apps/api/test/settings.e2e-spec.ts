import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { companyResponse } from '../src/settings/responses.js';
import { type Api, apiFor, startApp, tokenFor } from './support.js';

const company = {
  name: 'Meghna Plastic Industries Ltd',
  address: 'Plot 22, Savar Industrial Area, Savar, Dhaka',
  phone: '+880 2 7745 0110',
};

describe('company settings', () => {
  let app: INestApplication;
  let owner: Api;

  const save = (body: object, api = owner) =>
    api.put('/settings/company').send(body);

  beforeEach(async () => {
    app = await startApp();
    owner = apiFor(app, await tokenFor(app, Role.OWNER));
  });

  afterEach(async () => {
    await app.close();
  });

  it('is empty until the owner saves it, then reads back what was saved', async () => {
    expect((await owner.get('/settings/company').expect(200)).body).toEqual({
      name: '',
      address: '',
      phone: '',
      bin: null,
    });

    await save({ ...company, bin: '0012345678901' }).expect(200);
    const saved = (await owner.get('/settings/company').expect(200)).body;

    expect(saved).toEqual({ ...company, bin: '0012345678901' });
    companyResponse.strict().parse(saved);
  });

  it('keeps the BIN optional, and 13 digits when given', async () => {
    await save({ ...company, bin: '0012345678901' }).expect(200);

    expect((await save(company).expect(200)).body.bin).toBeNull();
    await save({ ...company, bin: '001234567890' }).expect(400);
    await save({ ...company, bin: '00123456789012' }).expect(400);
    await save({ ...company, bin: '001234567890A' }).expect(400);
    await save({ ...company, name: ' ' }).expect(400);
    expect(await app.get(PrismaService).companySettings.count()).toBe(1);
  });

  it('saves once when sent twice, with an outbox event', async () => {
    const prisma = app.get(PrismaService);
    const twice = () =>
      save(company).set('Idempotency-Key', 'company-1').expect(200);

    await twice();
    await twice();

    expect(
      await prisma.outboxEvent.count({
        where: { type: 'settings.company_saved' },
      }),
    ).toBe(1);
  });

  it.each(ALL_ROLES)('gives %s the right access', async (role) => {
    const api =
      role === Role.OWNER ? owner : apiFor(app, await tokenFor(app, role));

    await api.get('/settings/company').expect(200);
    await save(company, api).expect(role === Role.OWNER ? 200 : 403);
  });
});
