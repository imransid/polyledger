import { Test } from '@nestjs/testing';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

it('runs database sessions in UTC', async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  await moduleRef.init();

  const [session] = await moduleRef.get(PrismaService).$queryRaw<
    [{ timezone: string }]
  >`select current_setting('TimeZone') as timezone`;
  await moduleRef.close();

  expect(session.timezone).toBe('UTC');
});
