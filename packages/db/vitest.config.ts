import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Container startup dominates: the first run pulls the postgres:18
    // image. Individual assertions remain fast; the timeout covers setup.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // One container per test file; files run sequentially to keep local
    // Docker resource usage predictable. Revisit if the suite grows slow.
    fileParallelism: false,
  },
});
