import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { factoryToday, fromDateString } from '../../common/dates.js';
import { GetCustomerQuery } from '../../customers/queries/get-customer.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DeliverOrderCommand } from '../../orders/commands/deliver-order.js';
import { GetSalesOrderQuery } from '../../orders/queries/get-sales-order.js';
import { PostStockDocumentCommand } from '../../stock/commands/post-stock-document.js';
import { GetLocationQuery } from '../../stock/queries/get-location.js';
import type { ChallanLine } from '../infra/challans.js';
import {
  type ChallanView,
  toChallanView,
  withDetails,
} from '../infra/views.js';

export interface NewChallan {
  orderId: string;
  fromLocationId: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  /** Null for the customer's own address. */
  deliveryAddress: string | null;
  notes: string | null;
  lines: ChallanLine[];
}

export class PostChallanCommand extends Command<ChallanView> {
  constructor(
    readonly actorId: string,
    readonly challan: NewChallan,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// The goods leave stock when the challan is posted; the gate pass later
// only confirms they went out of the gate.
@CommandHandler(PostChallanCommand)
export class PostChallanHandler implements ICommandHandler<PostChallanCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    challan,
    idempotencyKey,
  }: PostChallanCommand): Promise<ChallanView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'PostChallan' },
        () => this.post(tx, actorId, challan),
      ),
    );
  }

  private async post(
    tx: Prisma.TransactionClient,
    actorId: string,
    challan: NewChallan,
  ): Promise<ChallanView> {
    const store = await this.queryBus.execute(
      new GetLocationQuery(challan.fromLocationId),
    );
    if (!store?.isActive || store.kind !== 'FINISHED_GOODS_STORE') {
      throw new BadRequestException(
        'Deliver from an active finished goods store',
      );
    }
    const order = await this.queryBus.execute(
      new GetSalesOrderQuery(challan.orderId),
    );
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    await this.commandBus.execute(
      new DeliverOrderCommand(tx, order.id, challan.lines),
    );
    const document = await this.commandBus.execute(
      new PostStockDocumentCommand(
        tx,
        { kind: 'DISPATCH', postedById: actorId },
        challan.lines.map(({ productId, pieces }) => ({
          itemType: 'PRODUCT' as const,
          itemId: productId,
          locationId: challan.fromLocationId,
          change: { by: -pieces },
        })),
      ),
    );
    const created = await tx.deliveryChallan.create({
      data: {
        number: document.number,
        stockDocumentId: document.id,
        orderId: order.id,
        customerId: order.customerId,
        fromLocationId: challan.fromLocationId,
        vehicleNumber: challan.vehicleNumber,
        driverName: challan.driverName,
        driverPhone: challan.driverPhone,
        deliveryAddress:
          challan.deliveryAddress ??
          (await this.customerAddress(order.customerId)),
        notes: challan.notes,
        dispatchedOn: fromDateString(factoryToday()),
        recordedById: actorId,
        lines: { create: challan.lines },
      },
      include: withDetails,
    });
    await recordEvent(tx, 'dispatch.challan_posted', {
      challanId: created.id,
      number: created.number,
      orderId: order.id,
      orderNumber: order.number,
      lines: challan.lines,
    });
    return toChallanView(created);
  }

  private async customerAddress(customerId: string): Promise<string> {
    const customer = await this.queryBus.execute(
      new GetCustomerQuery(customerId),
    );
    return customer!.address;
  }
}
