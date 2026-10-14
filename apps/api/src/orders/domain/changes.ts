export interface OrderLine {
  productId: string;
  pieces: number;
  unitPricePoisha: number | null;
}

export interface OrderSnapshot {
  customerId: string;
  orderDate: string;
  deliveryDate: string;
  customerPo: string | null;
  notes: string | null;
  overDeliveryBasisPoints: number;
  lines: OrderLine[];
}

export type OrderChanges = Partial<OrderSnapshot>;

export const CONFIRMED_CHANGE_RULE =
  'A confirmed order can only change its pieces, delivery date and over-delivery tolerance';

// A confirmed order is a promise to the customer: it keeps its number and
// products, and only the pieces, the delivery date and the tolerance may
// move. Nothing has shipped yet: the first challan starts production.
export function isAllowedOnConfirmed(
  before: OrderSnapshot,
  changes: OrderChanges,
): boolean {
  const {
    deliveryDate: _deliveryDate,
    overDeliveryBasisPoints: _overDeliveryBasisPoints,
    lines,
    ...others
  } = changes;
  if (Object.keys(others).length > 0) {
    return false;
  }
  if (!lines) {
    return true;
  }
  const original = new Map(before.lines.map((line) => [line.productId, line]));
  return (
    lines.length === before.lines.length &&
    lines.every(
      (line) =>
        original.has(line.productId) &&
        original.get(line.productId)!.unitPricePoisha ===
          (line.unitPricePoisha ?? null),
    )
  );
}

// Old -> new for every field that changed, for the outbox event.
export function describeChanges(
  before: OrderSnapshot,
  after: OrderSnapshot,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of Object.keys(before) as (keyof OrderSnapshot)[]) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return changes;
}
