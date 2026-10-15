import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PIN_MAX_LENGTH } from '@polyledger/shared';
import { z } from 'zod';
import {
  type PushedChanges,
  PushRecordsCommand,
} from './commands/push-records.js';
import { StartSessionCommand } from './commands/start-session.js';
import { CurrentDevice, Device, type PairedDevice } from './device.guard.js';
import { PullChangesQuery } from './queries/pull-changes.js';
import { pullResponse, pushResponse, sessionResponse } from './responses.js';

const sessionBody = z.object({
  userId: z.uuid().describe('Picked from the tablet_users the tablet pulled'),
  pin: z.string().max(PIN_MAX_LENGTH),
});

const pullQuery = z.object({
  lastPulledAt: z
    .string()
    .regex(/^(\d+|null)$/)
    .optional()
    .transform((value) =>
      value === undefined || value === 'null' ? null : Number(value),
    )
    .describe('The timestamp from the last pull; leave out the first time'),
});

const tableChanges = z.object({
  created: z.array(z.looseObject({ id: z.uuid() })).default([]),
  updated: z.array(z.looseObject({ id: z.uuid() })).default([]),
  deleted: z.array(z.uuid()).default([]),
});

const pushBody = z.object({
  changes: z.object({
    production_entries: tableChanges.optional(),
    waste_entries: tableChanges.optional(),
  }),
});

// What a paired tablet calls, in WatermelonDB's sync shapes.
@ApiHeader({ name: 'X-Device-Token', required: true })
@Device()
@Controller('sync')
export class SyncController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** Signing in with a PIN; wrong PINs lock the user out of this tablet. */
  // The lock-out counts wrong PINs per user and tablet; this only slows a
  // tablet trying many users.
  @UseGuards(ThrottlerGuard)
  @Throttle({ perIp: { limit: 30, ttl: 60_000 } })
  @SkipThrottle({ perLogin: true })
  @Post('sessions')
  @ApiCreatedResponse({ standardSchema: sessionResponse })
  startSession(
    @CurrentDevice() device: PairedDevice,
    @Body({ schema: sessionBody }) body: z.infer<typeof sessionBody>,
  ) {
    return this.commandBus.execute(
      new StartSessionCommand(device, body.userId, body.pin),
    );
  }

  @Get('pull')
  @ApiOkResponse({ standardSchema: pullResponse })
  pull(
    @CurrentDevice() device: PairedDevice,
    @Query({ schema: pullQuery }) query: z.infer<typeof pullQuery>,
  ) {
    return this.queryBus.execute(
      new PullChangesQuery(device, query.lastPulledAt),
    );
  }

  /** Accepts or refuses each record on its own. */
  @Post('push')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: pushResponse })
  push(
    @CurrentDevice() device: PairedDevice,
    @Body({ schema: pushBody }) body: z.infer<typeof pushBody>,
  ) {
    return this.commandBus.execute(
      new PushRecordsCommand(device, body.changes as PushedChanges),
    );
  }
}
