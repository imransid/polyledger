import type { SalesOrderStatus } from '../../generated/prisma/client.js';

export type OrderAction = 'confirm' | 'startProduction' | 'complete' | 'cancel';

// Cancelling is only possible before production starts.
export const TRANSITIONS: Record<
  OrderAction,
  { from: SalesOrderStatus[]; to: SalesOrderStatus; done: string }
> = {
  confirm: { from: ['DRAFT'], to: 'CONFIRMED', done: 'confirmed' },
  startProduction: {
    from: ['CONFIRMED'],
    to: 'IN_PRODUCTION',
    done: 'put into production',
  },
  complete: { from: ['IN_PRODUCTION'], to: 'COMPLETED', done: 'completed' },
  cancel: { from: ['DRAFT', 'CONFIRMED'], to: 'CANCELLED', done: 'cancelled' },
};
