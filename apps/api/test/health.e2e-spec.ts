import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { Env } from '../src/config/env.js';
import { PrismaService } from '../src/database/prisma.service.js';

async function startApp(prisma?: PrismaService): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (prisma) {
    builder.overrideProvider(PrismaService).useValue(prisma);
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
    const unreachable = new PrismaService(
      new ConfigService<Env, true>({
        DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none',
      }),
    );
    app = await startApp(unreachable);

    await request(app.getHttpServer()).get('/health').expect(503);
  });
});
