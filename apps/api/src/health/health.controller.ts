import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/public.decorator.js';
import { DATABASE, type Database } from '../database/database.module.js';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.db.execute(sql`select 1`);
    } catch (error) {
      // Drizzle wraps driver errors; the actual reason is in the cause.
      const reason = error instanceof Error ? (error.cause ?? error) : error;
      this.logger.error(`Database check failed: ${String(reason)}`);
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok' };
  }
}
