import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Container startup dominates (postgres + redis on first pull).
    hookTimeout: 180_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
