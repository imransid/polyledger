import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { userResponse } from './responses.js';
import { z } from 'zod';
import { activeFilter, listQuery, pageOf } from '../common/list-query.js';
import { phoneSchema } from '../common/phone.js';
import { Role } from '../generated/prisma/client.js';
import { ChangeUserRoleCommand } from './commands/change-user-role.js';
import { CreateUserCommand } from './commands/create-user.js';
import { DeactivateUserCommand } from './commands/deactivate-user.js';
import { ReactivateUserCommand } from './commands/reactivate-user.js';
import { ResetUserPasswordCommand } from './commands/reset-user-password.js';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from './decorators.js';
import { emailSchema } from './domain/login.js';
import { passwordSchema } from './domain/password.js';
import { ListUsersQuery } from './queries/list-users.js';

const createUserBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    role: z.enum(Role),
    password: passwordSchema,
  })
  .refine((user) => user.email !== undefined || user.phone !== undefined, {
    message: 'Email or phone is required',
  });

const changeRoleBody = z.object({ role: z.enum(Role) });

const resetPasswordBody = z.object({ newPassword: passwordSchema });

const userList = listQuery.extend({ active: activeFilter });

@Roles(Role.OWNER)
@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: pageOf(userResponse) })
  list(@Query({ schema: userList }) query: z.infer<typeof userList>) {
    return this.queryBus.execute(new ListUsersQuery(query));
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: userResponse })
  create(
    @CurrentUser() owner: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: createUserBody }) body: z.infer<typeof createUserBody>,
  ) {
    return this.commandBus.execute(
      new CreateUserCommand(owner.id, body, idempotencyKey),
    );
  }

  @Patch(':id/role')
  @ApiOkResponse({ standardSchema: userResponse })
  changeRole(
    @CurrentUser() owner: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body({ schema: changeRoleBody }) body: z.infer<typeof changeRoleBody>,
  ) {
    return this.commandBus.execute(
      new ChangeUserRoleCommand(owner.id, userId, body.role, idempotencyKey),
    );
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: userResponse })
  deactivate(
    @CurrentUser() owner: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) userId: string,
  ) {
    return this.commandBus.execute(
      new DeactivateUserCommand(owner.id, userId, idempotencyKey),
    );
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: userResponse })
  reactivate(
    @CurrentUser() owner: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) userId: string,
  ) {
    return this.commandBus.execute(
      new ReactivateUserCommand(owner.id, userId, idempotencyKey),
    );
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @ApiNoContentResponse()
  async resetPassword(
    @CurrentUser() owner: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body({ schema: resetPasswordBody })
    body: z.infer<typeof resetPasswordBody>,
  ) {
    await this.commandBus.execute(
      new ResetUserPasswordCommand(
        owner.id,
        userId,
        body.newPassword,
        idempotencyKey,
      ),
    );
  }
}
