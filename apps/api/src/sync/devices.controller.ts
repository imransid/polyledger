import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Public,
  Roles,
} from '../auth/decorators.js';
import { IssuePairingCodeCommand } from './commands/issue-pairing-code.js';
import { PairDeviceCommand } from './commands/pair-device.js';
import { RegisterDeviceCommand } from './commands/register-device.js';
import { RevokeDeviceCommand } from './commands/revoke-device.js';
import { ListDevicesQuery } from './queries/list-devices.js';
import {
  deviceResponse,
  pairingCodeResponse,
  pairingResponse,
} from './responses.js';
import { DEVICE_ADMINS } from './roles.js';

const deviceBody = z.object({
  name: z.string().trim().min(1).max(60),
  floorLocationId: z.uuid().describe('The production floor it stands on'),
});

const pairBody = z.object({ code: z.string().trim().min(1).max(20) });

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Roles(...DEVICE_ADMINS)
  @Get()
  @ApiOkResponse({ standardSchema: z.array(deviceResponse) })
  list() {
    return this.queryBus.execute(new ListDevicesQuery());
  }

  /** With a pairing code that works once, for 30 minutes. */
  @Roles(...DEVICE_ADMINS)
  @Post()
  @ApiCreatedResponse({ standardSchema: pairingCodeResponse })
  register(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: deviceBody }) body: z.infer<typeof deviceBody>,
  ) {
    return this.commandBus.execute(
      new RegisterDeviceCommand(user.id, body, idempotencyKey),
    );
  }

  /** The tablet's current token stops working until it pairs again. */
  @Roles(...DEVICE_ADMINS)
  @Post(':id/pairing-code')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: pairingCodeResponse })
  newPairingCode(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new IssuePairingCodeCommand(user.id, id, idempotencyKey),
    );
  }

  @Roles(...DEVICE_ADMINS)
  @Post(':id/revoke')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: deviceResponse })
  revoke(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new RevokeDeviceCommand(user.id, id, idempotencyKey),
    );
  }

  /** Called by the tablet, which has no token yet. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ perIp: { limit: 10, ttl: 60_000 } })
  @SkipThrottle({ perLogin: true })
  @Post('pair')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: pairingResponse })
  pair(@Body({ schema: pairBody }) body: z.infer<typeof pairBody>) {
    return this.commandBus.execute(new PairDeviceCommand(body.code));
  }
}
