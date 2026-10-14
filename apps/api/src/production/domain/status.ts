import type { JobCardStatus } from '../../generated/prisma/client.js';

export type JobCardAction = 'release' | 'start' | 'stop' | 'close' | 'cancel';

// Stop takes the mould off the machine so the next job can start while this
// one's goods are handed over and it is closed.
export const TRANSITIONS: Record<
  JobCardAction,
  { from: JobCardStatus[]; to: JobCardStatus; done: string }
> = {
  release: { from: ['PLANNED'], to: 'RELEASED', done: 'released' },
  start: { from: ['RELEASED'], to: 'RUNNING', done: 'started' },
  stop: { from: ['RUNNING'], to: 'RELEASED', done: 'stopped' },
  close: { from: ['RELEASED', 'RUNNING'], to: 'CLOSED', done: 'closed' },
  cancel: { from: ['PLANNED', 'RELEASED'], to: 'CANCELLED', done: 'cancelled' },
};

// Material, production and goods move only while the card is in work.
export const IN_WORK: JobCardStatus[] = ['RELEASED', 'RUNNING'];
