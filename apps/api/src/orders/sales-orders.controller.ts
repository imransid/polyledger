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
import { found, listQuery } from '../common/list-query.js';
import { countSchema } from '../common/master-data.js';
import { INT_MAX } from '../common/quantities.js';
import { SalesOrderStatus } from '../generated/prisma/client.js';
import { CancelSalesOrderCommand } from './commands/cancel-sales-order.js';
import { ChangeSalesOrderCommand } from './commands/change-sales-order.js';
import { CompleteSalesOrderCommand } from './commands/complete-sales-order.js';
import { ConfirmSalesOrderCommand } from './commands/confirm-sales-order.js';
import { CreateSalesOrderCommand } from './commands/create-sales-order.js';
import { StartProductionCommand } from './commands/start-production.js';
import { GetMaterialCheckQuery } from './queries/get-material-check.js';
import { GetMaterialShortagesQuery } from './queries/get-material-shortages.js';
import { GetSalesOrderQuery } from './queries/get-sales-order.js';
import { ListSalesOrdersQuery } from './queries/list-sales-orders.js';
import { SALES_EDITORS, SALES_READERS } from './roles.js';

const linesSchema = z
  .array(
    z.object({
      productId: z.uuid(),
      pieces: countSchema,
      unitPricePoisha: z
        .number()
        .int()
        .min(0)
        .max(INT_MAX)
        .nullable()
        .default(null),
    }),
  )
  .min(1)
  .max(200)
  .refine(
    (lines) =>
      new Set(lines.map((line) => line.productId)).size === lines.length,
    'Each product can appear only once',
  );

const text = (max: number) =>
  z.string().trim().min(1).max(max).nullable().default(null);

const orderBody = z
  .object({
    customerId: z.uuid(),
    orderDate: z.iso.date(),
    deliveryDate: z.iso.date(),
    customerPo: text(50),
    notes: text(1000),
    lines: linesSchema,
  })
  .refine((order) => order.deliveryDate >= order.orderDate, {
    message: 'The delivery date cannot be before the order date',
    path: ['deliveryDate'],
  });

const orderChanges = z
  .object({
    customerId: z.uuid(),
    orderDate: z.iso.date(),
    deliveryDate: z.iso.date(),
    customerPo: z.string().trim().min(1).max(50).nullable(),
    notes: z.string().trim().min(1).max(1000).nullable(),
    lines: linesSchema,
  })
  .partial()
  .strict();

const orderList = listQuery.extend({
  status: z.enum(SalesOrderStatus).optional(),
  customerId: z.uuid().optional(),
  deliveryFrom: z.iso.date().optional(),
  deliveryTo: z.iso.date().optional(),
  late: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

const cancelBody = z.object({ reason: z.string().trim().min(1).max(300) });

@Roles(...SALES_READERS)
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@Query({ schema: orderList }) query: z.infer<typeof orderList>) {
    return this.queryBus.execute(new ListSalesOrdersQuery(query));
  }

  @Get('material-shortages')
  materialShortages() {
    return this.queryBus.execute(new GetMaterialShortagesQuery());
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetSalesOrderQuery(id)),
      'Sales order',
    );
  }

  @Get(':id/material-check')
  async materialCheck(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetMaterialCheckQuery(id)),
      'Sales order',
    );
  }

  @Roles(...SALES_EDITORS)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: orderBody }) order: z.infer<typeof orderBody>,
  ) {
    return this.commandBus.execute(
      new CreateSalesOrderCommand(user.id, order, idempotencyKey),
    );
  }

  @Roles(...SALES_EDITORS)
  @Patch(':id')
  change(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: orderChanges }) changes: z.infer<typeof orderChanges>,
  ) {
    return this.commandBus.execute(
      new ChangeSalesOrderCommand(user.id, id, changes, idempotencyKey),
    );
  }

  @Roles(...SALES_EDITORS)
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new ConfirmSalesOrderCommand(user.id, id, idempotencyKey),
    );
  }

  @Roles(...SALES_EDITORS)
  @Post(':id/start-production')
  @HttpCode(200)
  startProduction(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new StartProductionCommand(user.id, id, idempotencyKey),
    );
  }

  @Roles(...SALES_EDITORS)
  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new CompleteSalesOrderCommand(user.id, id, idempotencyKey),
    );
  }

  @Roles(...SALES_EDITORS)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: cancelBody }) body: z.infer<typeof cancelBody>,
  ) {
    return this.commandBus.execute(
      new CancelSalesOrderCommand(user.id, id, body.reason, idempotencyKey),
    );
  }
}
