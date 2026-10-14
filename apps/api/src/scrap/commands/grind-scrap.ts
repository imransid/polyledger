import { BadRequestException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { gramsForPieces } from '@polyledger/shared';
import { factoryToday, fromDateString } from '../../common/dates.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { GetRawMaterialsQuery } from '../../materials/queries/get-raw-materials.js';
import { GetProductQuery } from '../../products/queries/get-product.js';
import { PostStockDocumentCommand } from '../../stock/commands/post-stock-document.js';
import { assertLocation } from '../infra/locations.js';
import { type GrindingBatchView, toGrindingBatchView } from '../infra/views.js';

export type GrindingInput =
  | { itemType: 'RAW_MATERIAL'; itemId: string; grams: number }
  | { itemType: 'PRODUCT'; itemId: string; pieces: number };

export interface NewGrindingBatch {
  scrapLocationId: string;
  storeLocationId: string;
  input: GrindingInput;
  outputMaterialId: string;
  outputGrams: number;
}

export class GrindScrapCommand extends Command<GrindingBatchView> {
  constructor(
    readonly actorId: string,
    readonly batch: NewGrindingBatch,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Unground regrind or scrapped products go in at the scrap yard; ground
// regrind comes out into a raw material store, ready for a formula. What
// does not come out is the grinding loss.
@CommandHandler(GrindScrapCommand)
export class GrindScrapHandler implements ICommandHandler<GrindScrapCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    batch,
    idempotencyKey,
  }: GrindScrapCommand): Promise<GrindingBatchView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'GrindScrap' },
        () => this.grind(tx, actorId, batch),
      ),
    );
  }

  private async grind(
    tx: Prisma.TransactionClient,
    actorId: string,
    batch: NewGrindingBatch,
  ): Promise<GrindingBatchView> {
    await assertLocation(
      this.queryBus,
      batch.scrapLocationId,
      'SCRAP_YARD',
      'Grind from an active scrap yard',
    );
    await assertLocation(
      this.queryBus,
      batch.storeLocationId,
      'RAW_MATERIAL_STORE',
      'Ground regrind goes to an active raw material store',
    );
    const inputGrams = await this.inputGrams(batch.input);
    await this.assertRegrind(batch.outputMaterialId);
    if (batch.outputGrams > inputGrams) {
      throw new BadRequestException(
        `The output (${batch.outputGrams} g) cannot weigh more than the input (${inputGrams} g)`,
      );
    }

    const { input } = batch;
    const document = await this.commandBus.execute(
      new PostStockDocumentCommand(
        tx,
        { kind: 'GRINDING', postedById: actorId },
        [
          {
            itemType: input.itemType,
            itemId: input.itemId,
            locationId: batch.scrapLocationId,
            change: {
              by: -(input.itemType === 'PRODUCT' ? input.pieces : input.grams),
            },
          },
          {
            itemType: 'RAW_MATERIAL',
            itemId: batch.outputMaterialId,
            locationId: batch.storeLocationId,
            change: { by: batch.outputGrams },
          },
        ],
      ),
    );
    const created = await tx.grindingBatch.create({
      data: {
        stockDocumentId: document.id,
        scrapLocationId: batch.scrapLocationId,
        storeLocationId: batch.storeLocationId,
        inputItemType: input.itemType,
        inputItemId: input.itemId,
        inputPieces: input.itemType === 'PRODUCT' ? input.pieces : null,
        inputGrams,
        outputMaterialId: batch.outputMaterialId,
        outputGrams: batch.outputGrams,
        groundOn: fromDateString(factoryToday()),
        recordedById: actorId,
      },
    });
    await recordEvent(tx, 'scrap.ground', {
      batchId: created.id,
      documentNumber: document.number,
      inputGrams,
      outputGrams: batch.outputGrams,
    });
    return toGrindingBatchView(created);
  }

  private async inputGrams(input: GrindingInput): Promise<number> {
    if (input.itemType === 'RAW_MATERIAL') {
      await this.assertRegrind(input.itemId);
      return input.grams;
    }
    const product = await this.queryBus.execute(
      new GetProductQuery(input.itemId),
    );
    if (!product) {
      throw new BadRequestException(`Unknown product ${input.itemId}`);
    }
    return gramsForPieces(input.pieces, product.pieceWeightMg);
  }

  private async assertRegrind(rawMaterialId: string) {
    const [material] = await this.queryBus.execute(
      new GetRawMaterialsQuery([rawMaterialId]),
    );
    if (!material?.isActive || material.type !== 'REGRIND') {
      throw new BadRequestException(
        'Grinding takes and makes active REGRIND raw materials',
      );
    }
  }
}
