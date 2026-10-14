import {
  Body,
  Controller,
  Get,
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
import { INT_MAX, kilogramsSchema } from '../common/quantities.js';
import { GrindScrapCommand } from './commands/grind-scrap.js';
import { ReverseGrindingCommand } from './commands/reverse-grinding.js';
import { ReverseScrapSaleCommand } from './commands/reverse-scrap-sale.js';
import {
  SCRAP_REASONS,
  ScrapProductsCommand,
} from './commands/scrap-products.js';
import { SellScrapCommand } from './commands/sell-scrap.js';
import { ListGrindingBatchesQuery } from './queries/list-grinding-batches.js';
import { ListScrapSalesQuery } from './queries/list-scrap-sales.js';
import { GRINDING_REVERSERS, SCRAP_MANAGERS, SCRAP_STAFF } from './roles.js';

const positiveKilograms = kilogramsSchema.refine(
  (grams) => grams > 0,
  'Weights must be more than zero',
);

const scrapTransferBody = z.object({
  fromLocationId: z.uuid(),
  toLocationId: z.uuid(),
  reason: z.enum(SCRAP_REASONS),
  lines: z
    .array(z.object({ productId: z.uuid(), pieces: countSchema }))
    .min(1)
    .refine(
      (lines) =>
        new Set(lines.map((line) => line.productId)).size === lines.length,
      'Each product can appear only once',
    ),
});

const grindingInput = z
  .discriminatedUnion('itemType', [
    z.object({
      itemType: z.literal('RAW_MATERIAL'),
      itemId: z.uuid(),
      kilograms: positiveKilograms,
    }),
    z.object({
      itemType: z.literal('PRODUCT'),
      itemId: z.uuid(),
      pieces: countSchema,
    }),
  ])
  .transform((input) =>
    input.itemType === 'RAW_MATERIAL'
      ? {
          itemType: input.itemType,
          itemId: input.itemId,
          grams: input.kilograms,
        }
      : input,
  );

const grindingBody = z
  .object({
    scrapLocationId: z.uuid(),
    storeLocationId: z.uuid(),
    input: grindingInput,
    outputMaterialId: z.uuid(),
    outputKilograms: positiveKilograms,
  })
  .transform(({ outputKilograms, ...batch }) => ({
    ...batch,
    outputGrams: outputKilograms,
  }));

const pricePerKgPoisha = z
  .number()
  .int()
  .min(0)
  .max(INT_MAX)
  .describe('Price per kg in poisha: 45.50 BDT/kg is 4550');

const saleLine = z
  .discriminatedUnion('itemType', [
    z.object({
      itemType: z.literal('RAW_MATERIAL'),
      itemId: z.uuid(),
      kilograms: positiveKilograms,
      pricePerKgPoisha,
    }),
    z.object({
      itemType: z.literal('PRODUCT'),
      itemId: z.uuid(),
      pieces: countSchema,
      pricePerKgPoisha,
    }),
  ])
  .transform((line) =>
    line.itemType === 'RAW_MATERIAL'
      ? {
          itemType: line.itemType,
          itemId: line.itemId,
          grams: line.kilograms,
          pricePerKgPoisha: line.pricePerKgPoisha,
        }
      : line,
  );

const saleBody = z.object({
  buyerName: z.string().trim().min(1).max(100),
  scrapLocationId: z.uuid(),
  lines: z
    .array(saleLine)
    .min(1)
    .refine(
      (lines) =>
        new Set(lines.map((line) => `${line.itemType}:${line.itemId}`)).size ===
        lines.length,
      'Each item can appear only once',
    ),
});

const reasonBody = z.object({ reason: z.string().trim().min(1).max(300) });

@Controller('scrap')
export class ScrapController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** Finished goods into a scrap yard. Reverse it like any stock document. */
  @Roles(...SCRAP_MANAGERS)
  @Post('transfers')
  scrapProducts(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: scrapTransferBody })
    body: z.infer<typeof scrapTransferBody>,
  ) {
    return this.commandBus.execute(
      new ScrapProductsCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...SCRAP_STAFF)
  @Get('grinding')
  grindingBatches(
    @Query({ schema: dateRangeQuery }) query: z.infer<typeof dateRangeQuery>,
  ) {
    return this.queryBus.execute(
      new ListGrindingBatchesQuery(query.from, query.to),
    );
  }

  /**
   * One batch: REGRIND material by kilograms, or scrapped products by
   * pieces, ground into one REGRIND material in a raw material store.
   */
  @Roles(...SCRAP_STAFF)
  @Post('grinding')
  grind(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: grindingBody }) body: z.infer<typeof grindingBody>,
  ) {
    return this.commandBus.execute(
      new GrindScrapCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...GRINDING_REVERSERS)
  @Post('grinding/:id/reverse')
  reverseGrinding(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: reasonBody }) body: z.infer<typeof reasonBody>,
  ) {
    return this.commandBus.execute(
      new ReverseGrindingCommand(user.id, id, body.reason, idempotencyKey),
    );
  }

  @Roles(...SCRAP_MANAGERS)
  @Get('sales')
  sales(
    @Query({ schema: dateRangeQuery }) query: z.infer<typeof dateRangeQuery>,
  ) {
    return this.queryBus.execute(new ListScrapSalesQuery(query.from, query.to));
  }

  @Roles(...SCRAP_MANAGERS)
  @Post('sales')
  sell(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: saleBody }) body: z.infer<typeof saleBody>,
  ) {
    return this.commandBus.execute(
      new SellScrapCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...SCRAP_MANAGERS)
  @Post('sales/:id/reverse')
  reverseSale(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: reasonBody }) body: z.infer<typeof reasonBody>,
  ) {
    return this.commandBus.execute(
      new ReverseScrapSaleCommand(user.id, id, body.reason, idempotencyKey),
    );
  }
}
