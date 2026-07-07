import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Same deploy shape as apps/api: workspace TS bundled, deps external.
  noExternal: [/^@drovano\//],
  external: [/^(?!@drovano\/)[@a-z]/],
});
