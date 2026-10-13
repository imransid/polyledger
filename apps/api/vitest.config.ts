import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Test files share one database and clear its tables between tests.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-only-jwt-secret-0123456789abcdef',
      REFRESH_TOKEN_SECRET: 'test-only-refresh-secret-0123456789abcdef',
    },
  },
});
