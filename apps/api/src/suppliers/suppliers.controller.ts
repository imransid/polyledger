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
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { activeFilter, found, listQuery } from '../common/list-query.js';
import {
  codeSchema,
  MASTER_DATA_EDITORS,
  MASTER_DATA_READERS,
  nameSchema,
} from '../common/master-data.js';
import { phoneSchema } from '../common/phone.js';
import { CreateSupplierCommand } from './commands/create-supplier.js';
import { UpdateSupplierCommand } from './commands/update-supplier.js';
import { GetSupplierQuery } from './queries/get-supplier.js';
import { ListSuppliersQuery } from './queries/list-suppliers.js';

const supplierBody = z.object({
  code: codeSchema,
  name: nameSchema,
  phone: phoneSchema,
  address: z.string().trim().min(1).max(300),
});

const supplierChanges = supplierBody.omit({ code: true }).partial().strict();

const supplierList = listQuery.extend({ active: activeFilter });

@Roles(...MASTER_DATA_READERS)
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@Query({ schema: supplierList }) query: z.infer<typeof supplierList>) {
    return this.queryBus.execute(new ListSuppliersQuery(query));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetSupplierQuery(id)),
      'Supplier',
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: supplierBody }) body: z.infer<typeof supplierBody>,
  ) {
    return this.commandBus.execute(
      new CreateSupplierCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: supplierChanges }) changes: z.infer<typeof supplierChanges>,
  ) {
    return this.commandBus.execute(
      new UpdateSupplierCommand(user.id, id, changes, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new UpdateSupplierCommand(
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
  reactivate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new UpdateSupplierCommand(
        user.id,
        id,
        { isActive: true },
        idempotencyKey,
      ),
    );
  }
}
