import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { factoryToday, fromDateString } from '../../common/dates.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  DeliveryChallan,
  DeliveryChallanLine,
  LocationKind,
  Prisma,
  ReturnReason,
  ReturnSettlement,
} from '../../generated/prisma/client.js';
import { AdjustDeliveriesCommand } from '../../orders/commands/adjust-deliveries.js';
import { PostStockDocumentCommand } from '../../stock/commands/post-stock-document.js';
import { GetLocationQuery } from '../../stock/queries/get-location.js';
import {
  addReturnedPieces,
  type ChallanLine,
  lockChallan,
  productCodes,
} from '../infra/challans.js';
import { type ReturnView, toReturnView } from '../infra/views.js';

const RETURN_LOCATIONS: LocationKind[] = ['FINISHED_GOODS_STORE', 'SCRAP_YARD'];

export interface NewCustomerReturn {
  challanId: string;
  toLocationId: string;
  reason: ReturnReason;
  settlement: ReturnSettlement;
  lines: ChallanLine[];
}

export class RecordCustomerReturnCommand extends Command<ReturnView> {
  constructor(
    readonly actorId: string,
    readonly customerReturn: NewCustomerReturn,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Only REPLACE puts the pieces back on the order to deliver again, which can
// reopen it. CREDIT leaves the order as it is; both count as returned.
@CommandHandler(RecordCustomerReturnCommand)
export class RecordCustomerReturnHandler implements ICommandHandler<RecordCustomerReturnCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    customerReturn,
    idempotencyKey,
  }: RecordCustomerReturnCommand): Promise<ReturnView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'RecordCustomerReturn' },
        () => this.record(tx, actorId, customerReturn),
      ),
    );
  }

  private async record(
    tx: Prisma.TransactionClient,
    actorId: string,
    customerReturn: NewCustomerReturn,
  ): Promise<ReturnView> {
    const { challanId, toLocationId, settlement, lines } = customerReturn;
    const challan = await lockChallan(tx, challanId);
    if (challan.reversedAt) {
      throw new ConflictException(`${challan.number} is reversed`);
    }
    if (challan.gatePassStatus !== 'PASSED') {
      throw new ConflictException(
        `${challan.number} has not passed the gate; reverse it instead`,
      );
    }
    await this.assertReturnLocation(toLocationId);
    await this.assertReturnable(challan, lines);

    await this.commandBus.execute(
      new AdjustDeliveriesCommand(
        tx,
        challan.orderId,
        lines.map(({ productId, pieces }) => ({
          productId,
          deliveredPieces: settlement === 'REPLACE' ? -pieces : 0,
          returnedPieces: pieces,
        })),
      ),
    );
    await addReturnedPieces(tx, challanId, lines);
    const document = await this.commandBus.execute(
      new PostStockDocumentCommand(
        tx,
        {
          kind: 'CUSTOMER_RETURN',
          postedById: actorId,
          reason: customerReturn.reason,
        },
        lines.map(({ productId, pieces }) => ({
          itemType: 'PRODUCT' as const,
          itemId: productId,
          locationId: toLocationId,
          change: { by: pieces },
        })),
      ),
    );
    const created = await tx.customerReturn.create({
      data: {
        number: document.number,
        stockDocumentId: document.id,
        challanId,
        toLocationId,
        reason: customerReturn.reason,
        settlement,
        returnedOn: fromDateString(factoryToday()),
        recordedById: actorId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await recordEvent(tx, 'dispatch.customer_return_recorded', {
      returnId: created.id,
      number: created.number,
      challanNumber: challan.number,
      orderId: challan.orderId,
      reason: created.reason,
      settlement,
      lines,
    });
    return toReturnView(created);
  }

  private async assertReturnLocation(locationId: string) {
    const location = await this.queryBus.execute(
      new GetLocationQuery(locationId),
    );
    if (!location?.isActive || !RETURN_LOCATIONS.includes(location.kind)) {
      throw new BadRequestException(
        'Returns go to an active finished goods store or scrap yard',
      );
    }
  }

  private async assertReturnable(
    challan: DeliveryChallan & { lines: DeliveryChallanLine[] },
    lines: ChallanLine[],
  ) {
    const codes = await productCodes(
      this.queryBus,
      lines.map((line) => line.productId),
    );
    for (const { productId, pieces } of lines) {
      const code = codes.get(productId) ?? productId;
      const delivered = challan.lines.find((l) => l.productId === productId);
      if (!delivered) {
        throw new BadRequestException(`${code} is not on ${challan.number}`);
      }
      const left = delivered.pieces - delivered.returnedPieces;
      if (pieces > left) {
        throw new ConflictException(
          `${challan.number} has only ${left} ${code} left to return`,
        );
      }
    }
  }
}
