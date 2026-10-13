import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

@Controller('job-cards')
class JobCardsController {
  @Get()
  list() {
    return [];
  }
}

describe('access guard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [JobCardsController],
    }).compile();
    app = await moduleRef.createNestApplication().init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies a route that is not marked public', async () => {
    await request(app.getHttpServer()).get('/job-cards').expect(403);
  });
});
