import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { Role } from '../generated/prisma/client.js';
import { ChangeUserRoleCommand } from './commands/change-user-role.js';
import { CreateUserCommand } from './commands/create-user.js';
import { DeactivateUserCommand } from './commands/deactivate-user.js';
import { ResetUserPasswordCommand } from './commands/reset-user-password.js';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from './decorators.js';
import { emailSchema, phoneSchema } from './domain/login.js';
import { passwordSchema } from './domain/password.js';

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

@Roles(Role.OWNER)
@Controller('users')
export class UsersController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
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
  deactivate(
    @CurrentUser() owner: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) userId: string,
  ) {
    return this.commandBus.execute(
      new DeactivateUserCommand(owner.id, userId, idempotencyKey),
    );
  }

  @Post(':id/reset-password')
  @HttpCode(204)
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
