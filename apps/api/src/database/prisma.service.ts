import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

const logger = new Logger('Database');

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationShutdown
{
  constructor(config: ConfigService<Env, true>) {
    const adapter = new PrismaPg(
      {
        connectionString: config.get('DATABASE_URL', { infer: true }),
        connectionTimeoutMillis: 5_000,
        // Sessions run in UTC whatever the server default is.
        options: '-c TimeZone=UTC',
      },
      {
        onPoolError: (error) =>
          logger.error(`Idle client error: ${error.message}`),
      },
    );
    super({ adapter });
  }

  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
