# @drovano/crm

The CRM module: object/attribute definitions and record operations over
the typed-EAV graph (`docs/architecture/data-model.md` §2/§4; schema in
`@drovano/db` `src/schema/graph.ts`).

## Public interface

- Definitions: `createObjectDefinition`, `createAttributeDefinition`
  (key format + type-specific config validated; duplicates rejected with
  actionable `CrmError`s).
- Records: `createRecord`, `updateRecordValues` (upsert), `getRecord`,
  `listRecords` (cursor pagination on time-ordered uuidv7 ids),
  `softDeleteRecord`. All functions take a `TenantTransaction` — callers
  own `withTenant` + `can()`; services own validation, provenance, and
  the transactional audit entry.
- Values: `toValueColumns`/`fromValueColumns` map each attribute type to
  exactly one typed-EAV column (zod-validated); the database CHECK
  constraint (migration 0005) is the backstop.

## Invariants

1. Records are tenant-level (one graph per organization); record-/
   object-level grants are the documented post-v1 seam.
2. Exactly one value column populated per row — module AND database
   enforce it.
3. User schema changes are row operations, never DDL.
4. `test/storage-benchmark.test.ts` guards the scale NFR: PR runs at
   100k records; `DROVANO_BENCH_SCALE=1000000` runs the full PRD claim
   (validated 2026-07-07: all budgets green at 1M records / 2M values).
