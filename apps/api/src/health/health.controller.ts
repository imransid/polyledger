import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../database/prisma.service.js';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`select 1`;
    } catch (error) {
      this.logger.error(`Database check failed: ${String(error)}`);
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok' };
  }
}
