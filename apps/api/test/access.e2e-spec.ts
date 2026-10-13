import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { Role } from '../src/generated/prisma/client.js';
import { createUser, logIn, startApp } from './support.js';

@Controller('job-cards')
class JobCardsController {
  @Get()
  list() {
    return [];
  }
}

describe('a route without @Public() or @Roles()', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await startApp(JobCardsController);
  });

  afterEach(async () => {
    await app.close();
  });

  it('asks anonymous callers for a token', async () => {
    await request(app.getHttpServer()).get('/job-cards').expect(401);
  });

  it('is denied even to an OWNER', async () => {
    await createUser(app, Role.OWNER);
    const { accessToken } = await logIn(app, 'owner@example.com');

    await request(app.getHttpServer())
      .get('/job-cards')
      .auth(accessToken, { type: 'bearer' })
      .expect(403);
  });
});
