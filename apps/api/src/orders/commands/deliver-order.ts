import { ConflictException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import type {
  Prisma,
  SalesOrderStatus,
} from '../../generated/prisma/client.js';
import { applyDeliveryChanges, lockOrder } from '../infra/deliveries.js';
import { moveOrder } from '../infra/status.js';

const DELIVERABLE: SalesOrderStatus[] = ['CONFIRMED', 'IN_PRODUCTION'];

// Dispatch posting a challan. Runs inside the caller's transaction so the
// stock leaving the store and the order's delivered pieces commit together.
// An order shipped from stock goes into production with its first challan.
export class DeliverOrderCommand extends Command<void> {
  constructor(
    readonly tx: Prisma.TransactionClient,
    readonly orderId: string,
    readonly lines: { productId: string; pieces: number }[],
  ) {
    super();
  }
}

@CommandHandler(DeliverOrderCommand)
export class DeliverOrderHandler implements ICommandHandler<DeliverOrderCommand> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute({ tx, orderId, lines }: DeliverOrderCommand): Promise<void> {
    const order = await lockOrder(tx, orderId);
    if (!DELIVERABLE.includes(order.status)) {
      throw new ConflictException(
        `${order.number} is ${order.status}; only ${DELIVERABLE.join(' or ')} orders can be delivered`,
      );
    }
    if (order.status === 'CONFIRMED') {
      await moveOrder(tx, orderId, 'startProduction');
    }
    await applyDeliveryChanges(
      tx,
      this.queryBus,
      order,
      lines.map(({ productId, pieces }) => ({
        productId,
        deliveredPieces: pieces,
        returnedPieces: 0,
      })),
    );
  }
}
