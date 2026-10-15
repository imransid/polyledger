import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CommandBus } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { ChangePasswordHandler } from './commands/change-password.js';
import { CheckPinHandler } from './commands/check-pin.js';
import { ChangeUserRoleHandler } from './commands/change-user-role.js';
import { CreateUserHandler } from './commands/create-user.js';
import { DeactivateUserHandler } from './commands/deactivate-user.js';
import { LogInHandler } from './commands/log-in.js';
import { LogOutHandler } from './commands/log-out.js';
import { ReactivateUserHandler } from './commands/reactivate-user.js';
import { RefreshSessionHandler } from './commands/refresh-session.js';
import { ResetUserPasswordHandler } from './commands/reset-user-password.js';
import { SeedOwnerCommand, SeedOwnerHandler } from './commands/seed-owner.js';
import { SetPinHandler } from './commands/set-pin.js';
import { normalizeLogin } from './domain/login.js';
import { RefreshCookie } from './infra/refresh-cookie.js';
import { TokenService } from './infra/tokens.js';
import { GetCurrentUserHandler } from './queries/get-current-user.js';
import { GetUserNamesHandler } from './queries/get-user-names.js';
import { ListChangedUsersHandler } from './queries/list-changed-users.js';
import { ListOperatorsHandler } from './queries/list-operators.js';
import { ListPinsHandler } from './queries/list-pins.js';
import { GetUserHandler } from './queries/get-user.js';
import { ListUsersHandler } from './queries/list-users.js';
import { UsersController } from './users.controller.js';

function byIpAndLogin(request: Record<string, any>): string {
  const login: unknown = request.body?.login;
  const name =
    typeof login === 'string' ? (normalizeLogin(login) ?? login) : '';
  return `${request.ip}|${name}`;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256', expiresIn: '15m' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Refresh keeps the perIp default; login raises it and adds perLogin.
    ThrottlerModule.forRoot([
      { name: 'perIp', ttl: 60_000, limit: 60 },
      { name: 'perLogin', ttl: 60_000, limit: 5, getTracker: byIpAndLogin },
    ]),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    TokenService,
    RefreshCookie,
    LogInHandler,
    RefreshSessionHandler,
    LogOutHandler,
    ChangePasswordHandler,
    CreateUserHandler,
    ChangeUserRoleHandler,
    DeactivateUserHandler,
    ReactivateUserHandler,
    ResetUserPasswordHandler,
    SeedOwnerHandler,
    GetCurrentUserHandler,
    GetUserHandler,
    GetUserNamesHandler,
    ListOperatorsHandler,
    ListUsersHandler,
    SetPinHandler,
    CheckPinHandler,
    ListPinsHandler,
    ListChangedUsersHandler,
  ],
})
export class AuthModule implements OnApplicationBootstrap {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap() {
    await this.commandBus.execute(
      new SeedOwnerCommand(
        this.config.get('OWNER_NAME', { infer: true }),
        this.config.get('OWNER_LOGIN', { infer: true }),
        this.config.get('OWNER_PASSWORD', { infer: true }),
      ),
    );
  }
}
