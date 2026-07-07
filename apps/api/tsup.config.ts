import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Workspace packages are TypeScript source (JIT packages, ADR-0001) —
  // bundle them in; every other bare import (including the workspace
  // packages' own deps, e.g. @node-rs/argon2 native binaries) stays
  // external and comes from node_modules at runtime.
  noExternal: [/^@drovano\//],
  external: [/^(?!@drovano\/)[@a-z]/],
});
