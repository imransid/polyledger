import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import type { Env } from '../config/env.js';
import { USERS } from './demo-data.js';
import { seedDemo } from './seed-demo.js';

// `pnpm db:seed:demo`: made-up data and users who share one password, so
// it refuses to run anywhere but a developer's machine.
const logger = new Logger('DemoSeed');
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
const config = app.get<ConfigService<Env, true>>(ConfigService);
try {
  if (config.get('NODE_ENV', { infer: true }) !== 'development') {
    throw new Error('The demo seed runs only with NODE_ENV=development');
  }
  const password = config.get('DEMO_PASSWORD', { infer: true });
  if (!password) {
    throw new Error('Set DEMO_PASSWORD in .env first');
  }
  await seedDemo(app, password);
  // The context only logs warnings and errors, to keep Nest's startup quiet.
  console.log(
    `Demo data created. These users log in with DEMO_PASSWORD: ${USERS.map((user) => user.email).join(', ')}`,
  );
} catch (error) {
  logger.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await app.close();
}
