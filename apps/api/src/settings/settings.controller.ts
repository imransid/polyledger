import { Body, Controller, Get, Put } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ALL_ROLES,
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { SaveCompanyCommand } from './commands/save-company.js';
import { GetCompanyQuery } from './queries/get-company.js';
import { companyResponse } from './responses.js';

const companyBody = z.object({
  name: z.string().trim().min(1).max(150),
  address: z.string().trim().min(1).max(300),
  phone: z.string().trim().min(1).max(100),
  bin: z
    .string()
    .trim()
    .regex(/^\d{13}$/, 'A BIN is 13 digits')
    .nullable()
    .default(null)
    .describe('Business Identification Number, printed on challans when set'),
});

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** Printed on every challan, by whoever prints it. */
  @Roles(...ALL_ROLES)
  @Get('company')
  @ApiOkResponse({ standardSchema: companyResponse })
  company() {
    return this.queryBus.execute(new GetCompanyQuery());
  }

  @Roles(Role.OWNER)
  @Put('company')
  @ApiOkResponse({ standardSchema: companyResponse })
  saveCompany(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: companyBody }) body: z.infer<typeof companyBody>,
  ) {
    return this.commandBus.execute(
      new SaveCompanyCommand(user.id, body, idempotencyKey),
    );
  }
}
