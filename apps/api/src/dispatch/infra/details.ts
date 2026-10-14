import type { QueryBus } from '@nestjs/cqrs';
import { GetCustomersQuery } from '../../customers/queries/get-customers.js';
import { GetSalesOrdersQuery } from '../../orders/queries/get-sales-orders.js';
import { GetProductsQuery } from '../../products/queries/get-products.js';
import type { ChallanView } from './views.js';

export type ChallanDetails = Omit<ChallanView, 'lines'> & {
  customerCode: string;
  customerName: string;
  orderNumber: string;
  customerPo: string | null;
  lines: (ChallanView['lines'][number] & {
    code: string;
    name: string;
    piecesPerCarton: number;
  })[];
};

// What the printout and the gate show besides the challan itself, so a
// guard or storekeeper can read a challan without master data access.
export async function describeChallans(
  queryBus: QueryBus,
  challans: ChallanView[],
): Promise<ChallanDetails[]> {
  const [customers, orders, products] = await Promise.all([
    queryBus.execute(
      new GetCustomersQuery(unique(challans.map((c) => c.customerId))),
    ),
    queryBus.execute(
      new GetSalesOrdersQuery(unique(challans.map((c) => c.orderId))),
    ),
    queryBus.execute(
      new GetProductsQuery(
        unique(challans.flatMap((c) => c.lines.map((l) => l.productId))),
      ),
    ),
  ]);
  const customer = byId(customers);
  const order = byId(orders);
  const product = byId(products);

  return challans.map((challan) => ({
    ...challan,
    customerCode: customer(challan.customerId).code,
    customerName: customer(challan.customerId).name,
    orderNumber: order(challan.orderId).number,
    customerPo: order(challan.orderId).customerPo,
    lines: challan.lines
      .map((line) => {
        const { code, name, piecesPerCarton } = product(line.productId);
        return { ...line, code, name, piecesPerCarton };
      })
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function byId<T extends { id: string }>(records: T[]): (id: string) => T {
  const found = new Map(records.map((record) => [record.id, record]));
  return (id) => found.get(id)!;
}
