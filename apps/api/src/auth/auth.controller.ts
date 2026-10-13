import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import { ChangePasswordCommand } from './commands/change-password.js';
import { LogInCommand } from './commands/log-in.js';
import { LogOutCommand } from './commands/log-out.js';
import { RefreshSessionCommand } from './commands/refresh-session.js';
import {
  ALL_ROLES,
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Public,
  Roles,
} from './decorators.js';
import { passwordSchema } from './domain/password.js';
import { GetCurrentUserQuery } from './queries/get-current-user.js';

const loginBody = z.object({
  login: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

const refreshTokenBody = z.object({
  refreshToken: z.string().min(1).max(100),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ perIp: { limit: 300, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  logIn(@Body({ schema: loginBody }) body: z.infer<typeof loginBody>) {
    return this.commandBus.execute(new LogInCommand(body.login, body.password));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ perLogin: true })
  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body({ schema: refreshTokenBody }) body: z.infer<typeof refreshTokenBody>,
  ) {
    return this.commandBus.execute(
      new RefreshSessionCommand(body.refreshToken),
    );
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logOut(
    @Body({ schema: refreshTokenBody }) body: z.infer<typeof refreshTokenBody>,
  ) {
    await this.commandBus.execute(new LogOutCommand(body.refreshToken));
  }

  @Roles(...ALL_ROLES)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }

  @Roles(...ALL_ROLES)
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: changePasswordBody })
    body: z.infer<typeof changePasswordBody>,
  ) {
    await this.commandBus.execute(
      new ChangePasswordCommand(
        user.id,
        user.sessionId,
        body.currentPassword,
        body.newPassword,
        idempotencyKey,
      ),
    );
  }
}
