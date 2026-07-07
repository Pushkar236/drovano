# scripts/

Operational and developer-experience scripts (setup, checks, generators).

Rules:

- Scripts are written in TypeScript (run via `tsx`) unless a shell one-liner
  is genuinely sufficient; they follow `CODING_STANDARDS.md` like all code.
- Every script has a `--help` output and a line in this README.
- Scripts are idempotent where possible and never destructive without an
  explicit `--force` style flag.

No scripts exist yet — the first (`verify-docs`, a docs/link consistency
checker) is TASK-0004 in `docs/tasks/BACKLOG.md`.
