import { toDateString } from '../../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { OrderSnapshot } from '../domain/changes.js';

export const withLines = {
  lines: { orderBy: { lineNo: 'asc' } },
} satisfies Prisma.SalesOrderInclude;

type OrderWithLines = Prisma.SalesOrderGetPayload<{
  include: typeof withLines;
}>;

export type SalesOrderView = Omit<
  OrderWithLines,
  'orderDate' | 'deliveryDate'
> & { orderDate: string; deliveryDate: string };

export function toView(order: OrderWithLines): SalesOrderView {
  return {
    ...order,
    orderDate: toDateString(order.orderDate),
    deliveryDate: toDateString(order.deliveryDate),
  };
}

export function snapshotOf(order: SalesOrderView): OrderSnapshot {
  return {
    customerId: order.customerId,
    orderDate: order.orderDate,
    deliveryDate: order.deliveryDate,
    customerPo: order.customerPo,
    notes: order.notes,
    overDeliveryBasisPoints: order.overDeliveryBasisPoints,
    lines: order.lines.map(({ productId, pieces, unitPricePoisha }) => ({
      productId,
      pieces,
      unitPricePoisha,
    })),
  };
}
