import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../config/env.js';

export const PG_POOL = Symbol('PG_POOL');
export const DATABASE = Symbol('DATABASE');

export type Database = NodePgDatabase;

function createPool(config: ConfigService<Env, true>): Pool {
  const pool = new Pool({
    connectionString: config.get('DATABASE_URL', { infer: true }),
    connectionTimeoutMillis: 5_000,
    // Sessions run in UTC whatever the server default is.
    options: '-c TimeZone=UTC',
  });
  // An idle client dropped by Postgres emits here; unhandled, it kills the process.
  pool.on('error', (error) => {
    new Logger('Database').error(`Idle client error: ${error.message}`);
  });
  return pool;
}

@Global()
@Module({
  providers: [
    { provide: PG_POOL, inject: [ConfigService], useFactory: createPool },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle({ client: pool }),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
