import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { createUser, logIn, PASSWORD, startApp } from './support.js';

describe('auth', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const refresh = (refreshToken: string) =>
    api().post('/auth/refresh').send({ refreshToken });
  const me = (accessToken: string) =>
    api().get('/auth/me').auth(accessToken, { type: 'bearer' });

  beforeEach(async () => {
    app = await startApp();
    await createUser(app, Role.OPERATOR);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns tokens that identify the user', async () => {
      const tokens = await logIn(app, 'operator@example.com');

      const response = await me(tokens.accessToken).expect(200);
      expect(response.body).toMatchObject({
        email: 'operator@example.com',
        role: Role.OPERATOR,
        isActive: true,
      });
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('accepts both phone formats', async () => {
      await createUser(app, Role.STOREKEEPER, { phone: '+8801712345678' });

      await logIn(app, '01712345678');
      await logIn(app, '+8801712345678');
    });

    it('gives one generic error for a wrong password and an unknown user', async () => {
      const wrongPassword = await api()
        .post('/auth/login')
        .send({ login: 'operator@example.com', password: 'not the password' })
        .expect(401);
      const unknownUser = await api()
        .post('/auth/login')
        .send({ login: 'nobody@example.com', password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Invalid login');
      expect(unknownUser.body).toEqual(wrongPassword.body);
    });

    it('allows 5 attempts per minute for one login name', async () => {
      const attempt = (login: string) =>
        api().post('/auth/login').send({ login, password: 'not the password' });

      for (let i = 0; i < 5; i++) {
        await attempt('operator@example.com').expect(401);
      }
      await attempt('Operator@Example.com').expect(429);
      await attempt('someone.else@example.com').expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token', async () => {
      const first = await logIn(app, 'operator@example.com');

      const second = (await refresh(first.refreshToken).expect(200)).body;

      expect(second.refreshToken).not.toBe(first.refreshToken);
      await me(second.accessToken).expect(200);
      await refresh(second.refreshToken).expect(200);
    });

    it('returns the same pair when the old token comes back within 30 seconds', async () => {
      const first = await logIn(app, 'operator@example.com');

      const second = (await refresh(first.refreshToken).expect(200)).body;
      const retry = (await refresh(first.refreshToken).expect(200)).body;

      expect(retry).toEqual(second);
    });

    it('answers two simultaneous refreshes with the same pair', async () => {
      const first = await logIn(app, 'operator@example.com');

      const [a, b] = await Promise.all([
        refresh(first.refreshToken).expect(200),
        refresh(first.refreshToken).expect(200),
      ]);

      expect(a.body).toEqual(b.body);
    });

    it('revokes every session when an old token comes back after 30 seconds', async () => {
      const first = await logIn(app, 'operator@example.com');
      const otherDevice = await logIn(app, 'operator@example.com');
      const second = (await refresh(first.refreshToken).expect(200)).body;
      await app.get(PrismaService).$executeRaw`
        UPDATE refresh_tokens SET revoked_at = revoked_at - interval '31 seconds'
        WHERE replaced_by_id IS NOT NULL`;

      await refresh(first.refreshToken).expect(401);

      await refresh(second.refreshToken).expect(401);
      await refresh(otherDevice.refreshToken).expect(401);
      await me(otherDevice.accessToken).expect(401);
    });

    it('allows 60 attempts per minute from one IP', async () => {
      for (let i = 0; i < 60; i++) {
        await refresh(`unknown-token-${i}`).expect(401);
      }
      await refresh('unknown-token-60').expect(429);
    });
  });

  describe('POST /auth/logout', () => {
    it('ends the session', async () => {
      const tokens = await logIn(app, 'operator@example.com');

      await api()
        .post('/auth/logout')
        .send({ refreshToken: tokens.refreshToken })
        .expect(204);

      await refresh(tokens.refreshToken).expect(401);
      await me(tokens.accessToken).expect(401);
    });
  });

  describe('POST /auth/password', () => {
    const changePassword = (accessToken: string, currentPassword: string) =>
      api()
        .post('/auth/password')
        .auth(accessToken, { type: 'bearer' })
        .send({ currentPassword, newPassword: 'a brand new password' });

    it('changes the password and ends the other sessions', async () => {
      const current = await logIn(app, 'operator@example.com');
      const otherDevice = await logIn(app, 'operator@example.com');

      await changePassword(current.accessToken, PASSWORD).expect(204);

      await me(current.accessToken).expect(200);
      await me(otherDevice.accessToken).expect(401);
      await refresh(otherDevice.refreshToken).expect(401);
      await api()
        .post('/auth/login')
        .send({ login: 'operator@example.com', password: PASSWORD })
        .expect(401);
      await logIn(app, 'operator@example.com', 'a brand new password');
    });

    it('refuses a wrong current password', async () => {
      const tokens = await logIn(app, 'operator@example.com');

      await changePassword(tokens.accessToken, 'not the password').expect(400);
    });
  });
});
