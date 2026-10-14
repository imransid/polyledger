import type { SalesOrderStatus } from '../../generated/prisma/client.js';

export type OrderAction =
  | 'confirm'
  | 'startProduction'
  | 'complete'
  | 'closeShort'
  | 'reopen'
  | 'cancel';

// Cancelling is only possible before production starts. Dispatch completes
// and reopens orders itself; closing short is the only manual way to finish.
export const TRANSITIONS: Record<
  OrderAction,
  {
    from: SalesOrderStatus[];
    to: SalesOrderStatus;
    done: string;
    event: string;
  }
> = {
  confirm: {
    from: ['DRAFT'],
    to: 'CONFIRMED',
    done: 'confirmed',
    event: 'confirmed',
  },
  startProduction: {
    from: ['CONFIRMED'],
    to: 'IN_PRODUCTION',
    done: 'put into production',
    event: 'in_production',
  },
  complete: {
    from: ['IN_PRODUCTION'],
    to: 'COMPLETED',
    done: 'completed',
    event: 'completed',
  },
  closeShort: {
    from: ['IN_PRODUCTION'],
    to: 'COMPLETED',
    done: 'closed short',
    event: 'closed_short',
  },
  reopen: {
    from: ['COMPLETED'],
    to: 'IN_PRODUCTION',
    done: 'reopened',
    event: 'reopened',
  },
  cancel: {
    from: ['DRAFT', 'CONFIRMED'],
    to: 'CANCELLED',
    done: 'cancelled',
    event: 'cancelled',
  },
};

/** Statuses that still owe the customer something. */
export const OPEN: SalesOrderStatus[] = ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION'];

// Late: still open the day after its delivery date (factory dates).
export function isLate(
  order: { status: SalesOrderStatus; deliveryDate: string },
  today: string,
): boolean {
  return OPEN.includes(order.status) && order.deliveryDate < today;
}
