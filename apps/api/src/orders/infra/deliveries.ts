import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  type DeliveryChange,
  deliveryLimit,
  isFullyDelivered,
} from '../domain/deliveries.js';
import { productCodes } from './references.js';
import { moveOrder } from './status.js';
import { type SalesOrderView, toView, withLines } from './views.js';

// Every change to delivered pieces locks the order first, so two challans
// on one order are checked one after the other and can't over-deliver.
export async function lockOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<SalesOrderView> {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM sales_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  if (!locked) {
    throw new NotFoundException('Sales order not found');
  }
  return toView(
    await tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: withLines,
    }),
  );
}

export async function applyDeliveryChanges(
  tx: Prisma.TransactionClient,
  queryBus: QueryBus,
  order: SalesOrderView,
  changes: DeliveryChange[],
): Promise<void> {
  const codes = await productCodes(
    queryBus,
    changes.map((change) => change.productId),
  );
  for (const change of changes) {
    const code = codes.get(change.productId) ?? change.productId;
    const line = order.lines.find((l) => l.productId === change.productId);
    if (!line) {
      throw new BadRequestException(`${code} is not on ${order.number}`);
    }
    const limit = deliveryLimit(line.pieces, order.overDeliveryBasisPoints);
    if (
      change.deliveredPieces > 0 &&
      line.deliveredPieces + change.deliveredPieces > limit
    ) {
      throw new ConflictException(
        `${order.number} can take only ${limit - line.deliveredPieces} more ${code}`,
      );
    }
    await tx.salesOrderLine.update({
      where: { orderId_lineNo: { orderId: order.id, lineNo: line.lineNo } },
      data: {
        deliveredPieces: { increment: change.deliveredPieces },
        returnedPieces: { increment: change.returnedPieces },
      },
    });
  }
  await settleStatus(tx, order.id);
}

// Complete once every line is delivered; reopen a completed order that is
// short again, unless it was closed short on purpose.
async function settleStatus(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.salesOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: withLines,
  });
  const delivered = isFullyDelivered(order.lines);
  if (delivered && order.status === 'IN_PRODUCTION') {
    await moveOrder(tx, orderId, 'complete');
  } else if (
    !delivered &&
    order.status === 'COMPLETED' &&
    order.shortCloseReason === null
  ) {
    await moveOrder(tx, orderId, 'reopen');
  }
}
