import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
    css: {
      modules: {
        // Class names resolve to their source names so assertions and axe
        // trees stay readable; real CSS is exercised in Storybook.
        classNameStrategy: 'non-scoped',
      },
    },
  },
});
