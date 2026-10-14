import { ConflictException, NotFoundException } from '@nestjs/common';
import { recordEvent } from '../../database/outbox.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type OrderAction, TRANSITIONS } from '../domain/status.js';
import { type SalesOrderView, toView, withLines } from './views.js';

// One conditional update: if two people cancel and start production at the
// same moment, the second finds the status already moved and gets a 409.
export async function moveOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  action: OrderAction,
  details: { cancelReason?: string; shortCloseReason?: string } = {},
): Promise<SalesOrderView> {
  const { from, to, done, event } = TRANSITIONS[action];
  const { count } = await tx.salesOrder.updateMany({
    where: { id: orderId, status: { in: from } },
    data: { ...details, status: to },
  });
  if (count === 0) {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }
    throw new ConflictException(
      `${order.number} is ${order.status}; only ${from.join(' or ')} orders can be ${done}`,
    );
  }

  const order = toView(
    await tx.salesOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: withLines,
    }),
  );
  await recordEvent(tx, `sales_order.${event}`, {
    orderId,
    number: order.number,
    ...details,
  });
  return order;
}
