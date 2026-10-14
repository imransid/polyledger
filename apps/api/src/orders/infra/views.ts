import { factoryToday, toDateString } from '../../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { OrderSnapshot } from '../domain/changes.js';
import { isLate } from '../domain/status.js';

export const withLines = {
  lines: { orderBy: { lineNo: 'asc' } },
} satisfies Prisma.SalesOrderInclude;

type OrderWithLines = Prisma.SalesOrderGetPayload<{
  include: typeof withLines;
}>;

export type SalesOrderView = Omit<
  OrderWithLines,
  'orderDate' | 'deliveryDate'
> & { orderDate: string; deliveryDate: string; late: boolean };

export function toView(order: OrderWithLines): SalesOrderView {
  const deliveryDate = toDateString(order.deliveryDate);
  return {
    ...order,
    orderDate: toDateString(order.orderDate),
    deliveryDate,
    late: isLate({ status: order.status, deliveryDate }, factoryToday()),
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
