import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';
import { server } from './server';

// Before any test module loads: the API client keeps the fetch it finds when
// it is created, and that must be the mocked one, never the real network.
server.listen({ onUnhandledRequest: 'error' });

afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
