# Changelog

All notable changes to Drovano are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/) once application code exists;
pre-application milestones are dated entries.

## [Unreleased]

### Added

- 2026-07-07 — M1 begins (Prompt 02, TASK-0004…0007): pnpm 10 + Turborepo
  monorepo with catalogs, Boundaries tags, and shared tsconfig presets
  (`@drovano/config`); CI quality gate (format, zero-warning ESLint
  strict-type-checked, typecheck, boundaries, tests, verify-docs, gitleaks)
  plus Renovate and pre-commit hooks; `@drovano/db` — Drizzle schema with
  RLS policies as code (`tenants`, append-only `audit_log`), migrations
  0000/0001 (non-owner `drovano_app` role, least-privilege grants, FORCE
  ROW LEVEL SECURITY), the `withTenant` tenant-scoping helper, and a
  Testcontainers real-Postgres-18 harness with nine tenant-isolation tests
  exercised through the app role; `scripts/verify-docs.ts` documentation
  consistency checker with unit tests.

- 2026-07-07 — Engineering foundation (Prompt 01, M0): repository and
  documentation structure; market, stack, and design research (snapshots
  dated 2026-07-06); product
  vision (`PROJECT.md`); PRD v1 (`docs/PRD.md`); architecture proposal
  (`ARCHITECTURE.md`, `docs/architecture/`); ADR-0001…ADR-0010; design
  philosophy (`DESIGN_SYSTEM.md`); engineering standards
  (`CODING_STANDARDS.md`, `TESTING.md`, `SECURITY.md`, `CONTRIBUTING.md`);
  roadmap (`ROADMAP.md`); initial backlog (`docs/tasks/BACKLOG.md`);
  Prompt 02 brief (`docs/prompts/prompt-02-brief.md`).
