import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
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
import { RefreshCookie } from './infra/refresh-cookie.js';
import { GetCurrentUserQuery } from './queries/get-current-user.js';
import { currentUserResponse, tokensResponse } from './responses.js';

const loginBody = z.object({
  login: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

// Empty for the office app, whose refresh token comes as a cookie.
const refreshTokenBody = z
  .object({ refreshToken: z.string().min(1).max(100).optional() })
  .default({});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

@ApiHeader({
  name: 'X-Client',
  required: false,
  description:
    'Send `office` to keep the refresh token in an httpOnly cookie instead of the body',
})
@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly refreshCookie: RefreshCookie,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ perIp: { limit: 300, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: tokensResponse })
  async logIn(
    @Body({ schema: loginBody }) body: z.infer<typeof loginBody>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.commandBus.execute(
      new LogInCommand(body.login, body.password),
    );
    return this.refreshCookie.deliver(request, response, tokens);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ perLogin: true })
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: tokensResponse })
  async refresh(
    @Body({ schema: refreshTokenBody }) body: z.infer<typeof refreshTokenBody>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const tokens = await this.commandBus.execute(
      new RefreshSessionCommand(this.refreshCookie.tokenFrom(request, body)),
    );
    return this.refreshCookie.deliver(request, response, tokens);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse()
  async logOut(
    @Body({ schema: refreshTokenBody }) body: z.infer<typeof refreshTokenBody>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.commandBus.execute(
      new LogOutCommand(this.refreshCookie.tokenFrom(request, body)),
    );
    this.refreshCookie.clear(request, response);
  }

  @Roles(...ALL_ROLES)
  @Get('me')
  @ApiOkResponse({ standardSchema: currentUserResponse })
  me(@CurrentUser() user: AuthUser) {
    return this.queryBus.execute(new GetCurrentUserQuery(user.id));
  }

  @Roles(...ALL_ROLES)
  @Post('password')
  @HttpCode(204)
  @ApiNoContentResponse()
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
