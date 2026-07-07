import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Container startup dominates (see packages/db/vitest.config.ts);
    // the storage benchmark also seeds via generate_series.
    hookTimeout: 300_000,
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
