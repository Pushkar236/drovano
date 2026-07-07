import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Container startup dominates (see packages/db/vitest.config.ts).
    hookTimeout: 180_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
