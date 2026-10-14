import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { found, listQuery, pageOf } from '../common/list-query.js';
import { countSchema } from '../common/master-data.js';
import { phoneSchema } from '../common/phone.js';
import {
  GatePassStatus,
  ReturnReason,
  ReturnSettlement,
} from '../generated/prisma/client.js';
import { PassGateCommand } from './commands/pass-gate.js';
import { PostChallanCommand } from './commands/post-challan.js';
import { RecordCustomerReturnCommand } from './commands/record-customer-return.js';
import { ReverseChallanCommand } from './commands/reverse-challan.js';
import { ReverseCustomerReturnCommand } from './commands/reverse-customer-return.js';
import { GetChallanQuery } from './queries/get-challan.js';
import { ListChallansQuery } from './queries/list-challans.js';
import { ListPendingGatePassesQuery } from './queries/list-pending-gate-passes.js';
import {
  DISPATCH_MANAGERS,
  DISPATCH_STAFF,
  DISPATCHERS,
  GATE_KEEPERS,
} from './roles.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  challanDetailsResponse,
  challanResponse,
  customerReturnResponse,
} from './responses.js';

const productLines = z
  .array(z.object({ productId: z.uuid(), pieces: countSchema }))
  .min(1)
  .max(200)
  .refine(
    (lines) =>
      new Set(lines.map((line) => line.productId)).size === lines.length,
    'Each product can appear only once',
  );

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().default(null);

const challanBody = z.object({
  orderId: z.uuid(),
  fromLocationId: z.uuid(),
  vehicleNumber: z.string().trim().toUpperCase().min(1).max(30),
  driverName: z.string().trim().min(1).max(100),
  driverPhone: phoneSchema,
  deliveryAddress: optionalText(300).describe(
    "Leave out to deliver to the customer's address",
  ),
  notes: optionalText(1000),
  lines: productLines,
});

const returnBody = z.object({
  challanId: z.uuid(),
  toLocationId: z.uuid(),
  reason: z.enum(ReturnReason),
  settlement: z
    .enum(ReturnSettlement)
    .describe(
      'REPLACE: the pieces are owed again and the order can reopen. CREDIT: the order stays as it is.',
    ),
  lines: productLines,
});

const challanList = listQuery
  .omit({ search: true })
  .extend({
    orderId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    gatePass: z.enum(GatePassStatus).optional(),
  })
  .refine((list) => !list.from || !list.to || list.from <= list.to, {
    message: 'from cannot be after to',
    path: ['to'],
  });

const reasonBody = z.object({ reason: z.string().trim().min(1).max(300) });

@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** Newest first. A gate pass filter leaves out reversed challans. */
  @Roles(...DISPATCH_STAFF)
  @Get('challans')
  @ApiOkResponse({ standardSchema: pageOf(challanDetailsResponse) })
  challans(@Query({ schema: challanList }) query: z.infer<typeof challanList>) {
    return this.queryBus.execute(new ListChallansQuery(query));
  }

  @Roles(...DISPATCH_STAFF)
  @Get('challans/:id')
  @ApiOkResponse({ standardSchema: challanDetailsResponse })
  async challan(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetChallanQuery(id)),
      'Delivery challan',
    );
  }

  /** Oldest first. */
  @Roles(...GATE_KEEPERS)
  @Get('gate-passes/pending')
  @ApiOkResponse({ standardSchema: z.array(challanDetailsResponse) })
  pendingGatePasses() {
    return this.queryBus.execute(new ListPendingGatePassesQuery());
  }

  @Roles(...DISPATCHERS)
  @Post('challans')
  @ApiCreatedResponse({ standardSchema: challanResponse })
  postChallan(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: challanBody }) body: z.infer<typeof challanBody>,
  ) {
    return this.commandBus.execute(
      new PostChallanCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...GATE_KEEPERS)
  @Post('challans/:id/gate-pass')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: challanResponse })
  passGate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new PassGateCommand(user.id, id, idempotencyKey),
    );
  }

  /** Only before the gate pass; after it, record a customer return. */
  @Roles(...DISPATCH_MANAGERS)
  @Post('challans/:id/reverse')
  @ApiCreatedResponse({ standardSchema: challanResponse })
  reverseChallan(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: reasonBody }) body: z.infer<typeof reasonBody>,
  ) {
    return this.commandBus.execute(
      new ReverseChallanCommand(user.id, id, body.reason, idempotencyKey),
    );
  }

  @Roles(...DISPATCH_MANAGERS)
  @Post('returns')
  @ApiCreatedResponse({ standardSchema: customerReturnResponse })
  recordReturn(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: returnBody }) body: z.infer<typeof returnBody>,
  ) {
    return this.commandBus.execute(
      new RecordCustomerReturnCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...DISPATCH_MANAGERS)
  @Post('returns/:id/reverse')
  @ApiCreatedResponse({ standardSchema: customerReturnResponse })
  reverseReturn(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: reasonBody }) body: z.infer<typeof reasonBody>,
  ) {
    return this.commandBus.execute(
      new ReverseCustomerReturnCommand(
        user.id,
        id,
        body.reason,
        idempotencyKey,
      ),
    );
  }
}
