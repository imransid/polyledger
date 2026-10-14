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
  test: {
    include: ['src/**/*.test.ts'],
  },
});
