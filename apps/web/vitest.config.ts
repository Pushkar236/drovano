import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
    // Shared CI runners are slow to stand up jsdom + user-event flows;
    // 5s default flaked in CI (TESTING.md rule 6: no timing luck). Must
    // stay above the 20s testing-library asyncUtilTimeout (setup.ts) with
    // room for multiple sequential waits in one test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
});
