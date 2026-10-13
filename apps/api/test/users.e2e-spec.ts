import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SeedOwnerCommand } from '../src/auth/commands/seed-owner.js';
import { ALL_ROLES } from '../src/auth/decorators.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { createUser, logIn, PASSWORD, startApp } from './support.js';

describe('users', () => {
  let app: INestApplication;
  let ownerToken: string;
  const api = () => request(app.getHttpServer());
  const asOwner = (method: 'post' | 'patch', path: string) =>
    api()[method](path).auth(ownerToken, { type: 'bearer' });

  beforeEach(async () => {
    app = await startApp();
    await createUser(app, Role.OWNER);
    ownerToken = (await logIn(app, 'owner@example.com')).accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /users', () => {
    const rahim = {
      name: 'Rahim',
      phone: '01712345678',
      role: Role.OPERATOR,
      password: PASSWORD,
    };

    it('creates a user who can log in', async () => {
      const response = await asOwner('post', '/users').send(rahim).expect(201);

      expect(response.body).toMatchObject({
        name: 'Rahim',
        phone: '+8801712345678',
        role: Role.OPERATOR,
      });
      expect(response.body).not.toHaveProperty('passwordHash');
      await logIn(app, '01712345678');
    });

    it('stores the password as an argon2id hash', async () => {
      await asOwner('post', '/users').send(rahim).expect(201);

      const user = await app.get(PrismaService).user.findUniqueOrThrow({
        where: { phone: '+8801712345678' },
      });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it.each(['1712345678', '+880 1712345678', '0171-2345678'])(
      'rejects the phone %s',
      async (phone) => {
        await asOwner('post', '/users')
          .send({ ...rahim, phone })
          .expect(400);
      },
    );

    it('requires an email or a phone', async () => {
      const { phone: _phone, ...withoutLogin } = rahim;

      await asOwner('post', '/users').send(withoutLogin).expect(400);
    });

    it('refuses a phone that is already in use', async () => {
      await asOwner('post', '/users').send(rahim).expect(201);

      await asOwner('post', '/users')
        .send({ ...rahim, phone: '+8801712345678' })
        .expect(409);
    });

    it('replays a repeated Idempotency-Key instead of creating twice', async () => {
      const first = await asOwner('post', '/users')
        .set('Idempotency-Key', 'create-rahim')
        .send(rahim)
        .expect(201);
      const second = await asOwner('post', '/users')
        .set('Idempotency-Key', 'create-rahim')
        .send(rahim)
        .expect(201);

      expect(second.body).toEqual(first.body);
      await asOwner('post', `/users/${first.body.id}/deactivate`)
        .set('Idempotency-Key', 'create-rahim')
        .expect(409);
    });

    it('creates once when the same Idempotency-Key arrives twice at once', async () => {
      const create = () =>
        asOwner('post', '/users')
          .set('Idempotency-Key', 'create-rahim')
          .send(rahim)
          .expect(201);

      const [a, b] = await Promise.all([create(), create()]);

      expect(a.body).toEqual(b.body);
      expect(
        await app.get(PrismaService).user.count({ where: { name: 'Rahim' } }),
      ).toBe(1);
    });
  });

  it('changes a role', async () => {
    const user = await createUser(app, Role.OPERATOR);

    const response = await asOwner('patch', `/users/${user.id}/role`)
      .send({ role: Role.SUPERVISOR })
      .expect(200);

    expect(response.body.role).toBe(Role.SUPERVISOR);
  });

  it('deactivating blocks login, refresh and existing access tokens', async () => {
    const user = await createUser(app, Role.OPERATOR);
    const tokens = await logIn(app, 'operator@example.com');

    await asOwner('post', `/users/${user.id}/deactivate`).expect(200);

    await api()
      .get('/auth/me')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(401);
    await api()
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
    await api()
      .post('/auth/login')
      .send({ login: 'operator@example.com', password: PASSWORD })
      .expect(401);
  });

  describe('GET /users', () => {
    const list = async (query = '') =>
      (
        await api()
          .get(`/users${query}`)
          .auth(ownerToken, { type: 'bearer' })
          .expect(200)
      ).body;

    beforeEach(async () => {
      await createUser(app, Role.OPERATOR, { phone: '+8801712345678' });
      await createUser(app, Role.STOREKEEPER);
      const supervisor = await createUser(app, Role.SUPERVISOR);
      await asOwner('post', `/users/${supervisor.id}/deactivate`).expect(200);
    });

    it('lists users without their password hashes', async () => {
      const page = await list();

      expect(page).toMatchObject({ total: 4, page: 1, pageSize: 50 });
      for (const user of page.items) {
        expect(user).not.toHaveProperty('passwordHash');
      }
    });

    it('searches by name, email and phone', async () => {
      expect((await list('?search=storekeeper')).total).toBe(1);
      expect((await list('?search=OWNER@EXAMPLE')).total).toBe(1);
      expect((await list('?search=01712345')).items[0].role).toBe(
        Role.OPERATOR,
      );
    });

    it('filters by active and pages', async () => {
      const inactive = await list('?active=false');
      expect(inactive.items.map((u: { role: Role }) => u.role)).toEqual([
        Role.SUPERVISOR,
      ]);

      const secondPage = await list('?pageSize=3&page=2');
      expect(secondPage).toMatchObject({ total: 4, page: 2 });
      expect(secondPage.items).toHaveLength(1);
    });
  });

  it('reactivating lets a user log in again, but not with old sessions', async () => {
    const user = await createUser(app, Role.OPERATOR);
    const tokens = await logIn(app, 'operator@example.com');
    await asOwner('post', `/users/${user.id}/deactivate`).expect(200);

    const response = await asOwner(
      'post',
      `/users/${user.id}/reactivate`,
    ).expect(200);

    expect(response.body.isActive).toBe(true);
    await api()
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
    await logIn(app, 'operator@example.com');
  });

  it('resetting a password ends their sessions', async () => {
    const user = await createUser(app, Role.OPERATOR);
    const tokens = await logIn(app, 'operator@example.com');

    await asOwner('post', `/users/${user.id}/reset-password`)
      .send({ newPassword: 'set by the owner' })
      .expect(204);

    await api()
      .get('/auth/me')
      .auth(tokens.accessToken, { type: 'bearer' })
      .expect(401);
    await logIn(app, 'operator@example.com', 'set by the owner');
  });

  it('will not remove the last active OWNER', async () => {
    const owner = await app.get(PrismaService).user.findUniqueOrThrow({
      where: { email: 'owner@example.com' },
    });

    await asOwner('post', `/users/${owner.id}/deactivate`).expect(409);
    await asOwner('patch', `/users/${owner.id}/role`)
      .send({ role: Role.MANAGER })
      .expect(409);

    await createUser(app, Role.OWNER, { email: 'second.owner@example.com' });
    await asOwner('patch', `/users/${owner.id}/role`)
      .send({ role: Role.MANAGER })
      .expect(200);
  });

  describe('roles', () => {
    const notOwners = ALL_ROLES.filter((role) => role !== Role.OWNER);

    it.each(ALL_ROLES)('%s can read /auth/me', async (role) => {
      if (role !== Role.OWNER) {
        await createUser(app, role);
      }
      const { accessToken } = await logIn(
        app,
        `${role.toLowerCase()}@example.com`,
      );

      await api()
        .get('/auth/me')
        .auth(accessToken, { type: 'bearer' })
        .expect(200);
    });

    it.each(notOwners)('%s cannot use the OWNER endpoints', async (role) => {
      const user = await createUser(app, role);
      const { accessToken } = await logIn(
        app,
        `${role.toLowerCase()}@example.com`,
      );
      const as = (method: 'get' | 'post' | 'patch', path: string) =>
        api()[method](path).auth(accessToken, { type: 'bearer' });

      await as('get', '/users').expect(403);
      await as('post', '/users').send({}).expect(403);
      await as('patch', `/users/${user.id}/role`).send({}).expect(403);
      await as('post', `/users/${user.id}/deactivate`).expect(403);
      await as('post', `/users/${user.id}/reactivate`).expect(403);
      await as('post', `/users/${user.id}/reset-password`).send({}).expect(403);
    });

    it('asks for a token before anything else', async () => {
      await api().post('/users').send({}).expect(401);
      await api().get('/auth/me').expect(401);
      await api()
        .get('/auth/me')
        .auth('not-a-jwt', { type: 'bearer' })
        .expect(401);
    });
  });
});

describe('seeding the first OWNER', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await startApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates the OWNER only while there are no users', async () => {
    const commandBus = app.get(CommandBus);

    await commandBus.execute(
      new SeedOwnerCommand('Karim', '01812345678', PASSWORD),
    );
    await commandBus.execute(
      new SeedOwnerCommand('Someone else', 'else@example.com', PASSWORD),
    );

    const users = await app.get(PrismaService).user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: 'Karim',
      phone: '+8801812345678',
      role: Role.OWNER,
    });
    await logIn(app, '01812345678');
  });

  it('does nothing without the OWNER_ variables', async () => {
    await app
      .get(CommandBus)
      .execute(new SeedOwnerCommand(undefined, undefined, undefined));

    expect(await app.get(PrismaService).user.count()).toBe(0);
  });

  it('refuses a partial set of OWNER_ variables', async () => {
    await expect(
      app
        .get(CommandBus)
        .execute(new SeedOwnerCommand('Karim', undefined, PASSWORD)),
    ).rejects.toThrow(
      'Set OWNER_NAME, OWNER_LOGIN and OWNER_PASSWORD together',
    );
  });
});
