import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiCreatedResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { kilogramsSchema } from '../common/quantities.js';
import { PostAdjustmentCommand } from './commands/post-adjustment.js';
import { PostOpeningCommand } from './commands/post-opening.js';
import { PostReceiptCommand } from './commands/post-receipt.js';
import { PostTransferCommand } from './commands/post-transfer.js';
import { ReverseDocumentCommand } from './commands/reverse-document.js';
import { stockLinesSchema } from './domain/lines.js';
import { postedDocumentResponse } from './responses.js';
import { STOCK_MANAGERS, STORE_STAFF } from './roles.js';

const reasonSchema = z.string().trim().min(1).max(300);

const receiptBody = z.object({
  supplierId: z.uuid(),
  supplierReference: z.string().trim().toUpperCase().min(1).max(50),
  receivedOn: z.iso.date(),
  locationId: z.uuid(),
  lines: z
    .array(
      z.object({
        rawMaterialId: z.uuid(),
        challanKilograms: kilogramsSchema,
        receivedKilograms: kilogramsSchema,
      }),
    )
    .min(1)
    .refine(
      (lines) =>
        new Set(lines.map((line) => line.rawMaterialId)).size === lines.length,
      'Each raw material can appear only once',
    )
    .refine(
      (lines) => lines.every((line) => line.challanKilograms > 0),
      'Challan kilograms must be more than zero',
    )
    .transform((lines) =>
      lines.map((line) => ({
        rawMaterialId: line.rawMaterialId,
        challanGrams: line.challanKilograms,
        receivedGrams: line.receivedKilograms,
      })),
    ),
});

const transferBody = z
  .object({
    fromLocationId: z.uuid(),
    toLocationId: z.uuid(),
    lines: stockLinesSchema,
  })
  .refine(
    (transfer) => transfer.fromLocationId !== transfer.toLocationId,
    'A transfer needs two different locations',
  )
  .refine(
    (transfer) => transfer.lines.every((line) => line.quantity > 0),
    'Quantities must be more than zero',
  );

const adjustmentBody = z.object({
  locationId: z.uuid(),
  reason: reasonSchema,
  lines: stockLinesSchema,
});

const openingBody = z.object({
  locationId: z.uuid(),
  lines: stockLinesSchema,
});

const reversalBody = z.object({ reason: reasonSchema });

@Controller('stock')
export class StockPostingsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Roles(...STORE_STAFF)
  @Post('receipts')
  @ApiCreatedResponse({ standardSchema: postedDocumentResponse })
  postReceipt(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: receiptBody }) receipt: z.infer<typeof receiptBody>,
  ) {
    return this.commandBus.execute(
      new PostReceiptCommand(user.id, receipt, idempotencyKey),
    );
  }

  @Roles(...STORE_STAFF)
  @Post('transfers')
  @ApiCreatedResponse({ standardSchema: postedDocumentResponse })
  postTransfer(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: transferBody }) transfer: z.infer<typeof transferBody>,
  ) {
    return this.commandBus.execute(
      new PostTransferCommand(user.id, transfer, idempotencyKey),
    );
  }

  @Roles(...STOCK_MANAGERS)
  @Post('adjustments')
  @ApiCreatedResponse({ standardSchema: postedDocumentResponse })
  postAdjustment(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: adjustmentBody })
    adjustment: z.infer<typeof adjustmentBody>,
  ) {
    return this.commandBus.execute(
      new PostAdjustmentCommand(user.id, adjustment, idempotencyKey),
    );
  }

  @Roles(...STOCK_MANAGERS)
  @Post('openings')
  @ApiCreatedResponse({ standardSchema: postedDocumentResponse })
  postOpening(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: openingBody }) opening: z.infer<typeof openingBody>,
  ) {
    return this.commandBus.execute(
      new PostOpeningCommand(user.id, opening, idempotencyKey),
    );
  }

  @Roles(...STOCK_MANAGERS)
  @Post('documents/:id/reverse')
  @ApiCreatedResponse({ standardSchema: postedDocumentResponse })
  reverse(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) documentId: string,
    @Body({ schema: reversalBody }) body: z.infer<typeof reversalBody>,
  ) {
    return this.commandBus.execute(
      new ReverseDocumentCommand(
        user.id,
        documentId,
        body.reason,
        idempotencyKey,
      ),
    );
  }
}
