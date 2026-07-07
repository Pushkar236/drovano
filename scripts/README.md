# scripts/

Operational and developer-experience scripts (setup, checks, generators).

Rules:

- Scripts are written in TypeScript (run via `tsx`) unless a shell one-liner
  is genuinely sufficient; they follow `CODING_STANDARDS.md` like all code.
- Every script has a `--help` output and a line in this README.
- Scripts are idempotent where possible and never destructive without an
  explicit `--force` style flag.

| Script                           | Purpose                                                                                                                          | Run                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/verify-docs.ts` (TASK-0004) | Docs consistency: broken relative links, dangling ADR/TASK references, unindexed ADRs. Read-only; exit 1 on defects. Runs in CI. | `pnpm verify-docs` |
