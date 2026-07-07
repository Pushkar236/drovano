import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
    // Shared CI runners are slow to stand up jsdom + user-event flows;
    // 5s default flaked in CI (TESTING.md rule 6: no timing luck).
    testTimeout: 15_000,
    hookTimeout: 30_000,
    css: {
      modules: {
        // Class names resolve to their source names so assertions and axe
        // trees stay readable; real CSS is exercised in Storybook.
        classNameStrategy: 'non-scoped',
      },
    },
  },
});
