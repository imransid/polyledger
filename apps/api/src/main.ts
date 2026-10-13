import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
const port = config.get('PORT', { infer: true });
await app.listen(port);
new Logger('Bootstrap').log(`API listening on port ${port}`);
