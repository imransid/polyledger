import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { afterEach, describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/database/database.module.js';

async function startApp(pool?: Pool): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (pool) {
    builder.overrideProvider(PG_POOL).useValue(pool);
  }
  const app = (await builder.compile()).createNestApplication();
  return app.init();
}

describe('GET /health', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns ok when the database answers', async () => {
    app = await startApp();

    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    const unreachable = new Pool({
      connectionString: 'postgres://nobody@127.0.0.1:1/none',
    });
    app = await startApp(unreachable);

    await request(app.getHttpServer()).get('/health').expect(503);
  });
});
