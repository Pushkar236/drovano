# Drovano Testing Standards

Testing is a design activity, not a gate at the end. Untested code is
unfinished code.

## The testing model

We use a **trophy-shaped** distribution: the bulk of confidence comes from
integration tests that exercise real module boundaries, supported by unit
tests for pure logic and a thin layer of end-to-end tests for critical
journeys.

| Layer         | What it proves                                                                                        | Where it runs        |
| ------------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
| Static        | Types, lint, dead code, dependency rules                                                              | Pre-commit + CI      |
| Unit          | Pure logic: domain rules, calculators, parsers, reducers                                              | CI, every PR         |
| Integration   | Module behavior against a **real Postgres** (Testcontainers), API contracts, authz + tenant isolation | CI, every PR         |
| End-to-end    | Critical user journeys in a real browser (Playwright)                                                 | CI on main + nightly |
| Accessibility | Automated axe checks in component/E2E tests + manual keyboard pass per feature                        | CI + per feature     |
| Performance   | Budgets on API latency and frontend bundles/interactions                                              | CI on main + release |

## Rules

1. **Every feature ships with tests** at the layers its risk demands. A data
   mutation without an integration test does not merge.
2. **Test behavior, not implementation.** Assert on outputs, persisted state,
   and emitted events — not on internal calls. Refactors should not break
   tests.
3. **Real database in integration tests.** Mocking the database validates the
   mock. Use ephemeral Postgres (Testcontainers); each test file gets an
   isolated schema or transaction-rollback sandbox.
4. **Tenant isolation is a first-class test target.** Every new queryable
   resource gets a test proving tenant A cannot read or mutate tenant B's
   data — including through list endpoints, search, and AI retrieval paths.
5. **Authorization matrix tests.** Each endpoint declares required
   permissions; tests assert both the allow and the deny paths.
6. **Deterministic tests.** No sleeps for synchronization, no reliance on
   wall-clock time or ordering luck. Flaky tests are quarantined within a day
   and fixed or deleted within a week.
7. **Error paths are tested**, not just happy paths: invalid input, conflict,
   not-found, permission-denied, downstream timeout.
8. **AI features are tested at two levels:** deterministic tests for the
   scaffolding (prompt assembly, tool wiring, output parsing, guardrails)
   with recorded/stubbed model responses; scenario evaluations (golden
   datasets, scored rubrics) for model-dependent quality, run scheduled —
   not on every PR.

## Regression protection

Every bug fixed gets a test that fails on the pre-fix code. No exceptions —
a bug that happened once is evidence the test suite had a hole.

## Coverage

Coverage is a diagnostic, not a target. We track it to find untested risk;
we do not chase percentages with assertion-free tests. Critical domains
(auth, permissions, billing, tenant isolation, data mutations) are expected
to sit near full branch coverage because their risk demands it.

## Performance checks

- API: p95 latency budgets per endpoint class, enforced by benchmark tests
  on main (regression = failing build, thresholds recorded per endpoint).
- Frontend: bundle-size budgets per route; interaction-latency budgets for
  core flows (open record, search, navigate) measured in E2E runs.
- Queries: new queries against large tables require an `EXPLAIN` review in
  the PR when they touch hot paths.

Concrete budget numbers are set in the PRD's non-functional requirements and
enforced once the first application code lands (M1).
