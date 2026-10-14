import { setupServer } from 'msw/node';

// The API, faked at the network level: screens go through the real
// generated client, Idempotency-Key and all.
export const server = setupServer();
