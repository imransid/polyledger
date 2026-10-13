import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/domain/password.js';
import type { TokenPair } from '../src/auth/infra/tokens.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Role } from '../src/generated/prisma/client.js';

export const PASSWORD = 'correct horse battery';

// A fresh app per test also gives every test fresh rate-limit counters.
export async function startApp(
  ...controllers: Type[]
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();
  await clearDatabase(moduleRef.get(PrismaService));

  const app = moduleRef.createNestApplication({ logger: false });
  return app.init();
}

// Every table except Prisma's migration history, so new tables need no edits here.
function clearDatabase(prisma: PrismaService) {
  return prisma.$executeRaw`
    DO $$
    DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I', tablename), ', ') INTO tables
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      EXECUTE 'TRUNCATE ' || tables;
    END $$`;
}

export async function createUser(
  app: INestApplication,
  role: Role,
  login: { email?: string; phone?: string } = {
    email: `${role.toLowerCase()}@example.com`,
  },
) {
  return app.get(PrismaService).user.create({
    data: {
      name: `${role} user`,
      ...login,
      role,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
}

export async function logIn(
  app: INestApplication,
  login: string,
  password = PASSWORD,
): Promise<TokenPair> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ login, password })
    .expect(200);
  return response.body;
}

export async function tokenFor(
  app: INestApplication,
  role: Role,
): Promise<string> {
  await createUser(app, role);
  return (await logIn(app, `${role.toLowerCase()}@example.com`)).accessToken;
}
