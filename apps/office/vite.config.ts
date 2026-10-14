import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 4467,
    strictPort: true,
    proxy: {
      // The API under /api on the same origin, as in production behind the
      // reverse proxy: no CORS, and the refresh cookie path matches.
      '/api': {
        target: 'http://127.0.0.1:4466',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Libraries change less often than our code, so they cache longer
          // in their own chunks; React alone is a quarter of the app.
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 2,
            },
            { name: 'vendor', test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    // Typing into whole forms is slow on a busy machine, such as CI running
    // the API's database tests next to these.
    testTimeout: 15_000,
  },
});
