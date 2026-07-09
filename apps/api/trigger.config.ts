import { defineConfig } from '@trigger.dev/sdk';

// Trigger.dev v4 (ADR-0007): durable execution for AI workers and sync
// jobs. Tasks live in src/trigger and wrap the app-tier workers — the
// same composition main.ts uses, minus the HTTP server.
export default defineConfig({
  project: 'proj_rgmhezbieidrowrzmatd',
  dirs: ['./src/trigger'],
  runtime: 'node',
  maxDuration: 600,
  build: {
    // The local embedder (ADR-0015) rides on native ONNX binaries —
    // esbuild cannot bundle .node files; resolve them at runtime.
    external: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 10_000,
      factor: 2,
      randomize: true,
    },
  },
});
