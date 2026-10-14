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
import { dateRangeQuery } from '../common/list-query.js';
import { countSchema } from '../common/master-data.js';
import { phoneSchema } from '../common/phone.js';
import { ReturnReason, ReturnSettlement } from '../generated/prisma/client.js';
import { PassGateCommand } from './commands/pass-gate.js';
import { PostChallanCommand } from './commands/post-challan.js';
import { RecordCustomerReturnCommand } from './commands/record-customer-return.js';
import { ReverseChallanCommand } from './commands/reverse-challan.js';
import { ReverseCustomerReturnCommand } from './commands/reverse-customer-return.js';
import { ListChallansQuery } from './queries/list-challans.js';
import { DISPATCH_MANAGERS, DISPATCH_STAFF, DISPATCHERS } from './roles.js';

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

const challanList = z.union([
  z.object({ orderId: z.uuid() }),
  dateRangeQuery.safeExtend({ customerId: z.uuid() }),
]);

const reasonBody = z.object({ reason: z.string().trim().min(1).max(300) });

@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** An order's challans, or a customer's by dispatch date. */
  @Roles(...DISPATCH_STAFF)
  @Get('challans')
  challans(@Query({ schema: challanList }) query: z.infer<typeof challanList>) {
    return this.queryBus.execute(
      new ListChallansQuery(
        'orderId' in query ? { orderId: query.orderId } : query,
      ),
    );
  }

  @Roles(...DISPATCH_STAFF)
  @Get('gate-passes/pending')
  pendingGatePasses() {
    return this.queryBus.execute(
      new ListChallansQuery({ gatePassPending: true }),
    );
  }

  @Roles(...DISPATCHERS)
  @Post('challans')
  postChallan(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: challanBody }) body: z.infer<typeof challanBody>,
  ) {
    return this.commandBus.execute(
      new PostChallanCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...DISPATCH_STAFF)
  @Post('challans/:id/gate-pass')
  @HttpCode(200)
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
