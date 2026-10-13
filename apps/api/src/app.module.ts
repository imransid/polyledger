import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from './auth/auth.module.js';
import { envSchema } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      // Tests take their environment from vitest.config.ts, never from a
      // developer's .env (which may seed an OWNER, for example).
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    CqrsModule.forRoot(),
    DatabaseModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
  ],
})
export class AppModule {}
