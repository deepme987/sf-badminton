import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Postgres tests hit the real Supabase, so don't run them in parallel.
    sequence: {
      concurrent: false,
    },
    // Loading .env.local before tests run.
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
