import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';
import { server } from './server';

// Before any test module loads: the API client keeps the fetch it finds when
// it is created, and that must be the mocked one, never the real network.
server.listen({ onUnhandledRequest: 'error' });

// findBy and waitFor give up after 1 s by default: too short when the API's
// database tests run alongside, as `pnpm test` and CI do.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
