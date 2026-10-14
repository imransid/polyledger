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
import { z } from 'zod';
import { customerResponse } from './responses.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import {
  activeFilter,
  found,
  listQuery,
  pageOf,
} from '../common/list-query.js';
import {
  codeSchema,
  MASTER_DATA_EDITORS,
  MASTER_DATA_READERS,
  nameSchema,
} from '../common/master-data.js';
import { phoneSchema } from '../common/phone.js';
import { CreateCustomerCommand } from './commands/create-customer.js';
import { UpdateCustomerCommand } from './commands/update-customer.js';
import { GetCustomerQuery } from './queries/get-customer.js';
import { ListCustomersQuery } from './queries/list-customers.js';

const customerBody = z.object({
  code: codeSchema,
  name: nameSchema,
  phone: phoneSchema,
  address: z.string().trim().min(1).max(300),
});

const customerChanges = customerBody.omit({ code: true }).partial().strict();

const customerList = listQuery.extend({ active: activeFilter });

@Roles(...MASTER_DATA_READERS)
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: pageOf(customerResponse) })
  list(@Query({ schema: customerList }) query: z.infer<typeof customerList>) {
    return this.queryBus.execute(new ListCustomersQuery(query));
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: customerResponse })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetCustomerQuery(id)),
      'Customer',
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post()
  @ApiCreatedResponse({ standardSchema: customerResponse })
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: customerBody }) body: z.infer<typeof customerBody>,
  ) {
    return this.commandBus.execute(
      new CreateCustomerCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Patch(':id')
  @ApiOkResponse({ standardSchema: customerResponse })
  update(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: customerChanges }) changes: z.infer<typeof customerChanges>,
  ) {
    return this.commandBus.execute(
      new UpdateCustomerCommand(user.id, id, changes, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: customerResponse })
  deactivate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new UpdateCustomerCommand(
        user.id,
        id,
        { isActive: false },
        idempotencyKey,
      ),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post(':id/reactivate')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: customerResponse })
  reactivate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new UpdateCustomerCommand(
        user.id,
        id,
        { isActive: true },
        idempotencyKey,
      ),
    );
  }
}
