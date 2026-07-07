# @drovano/permissions

The centralized permission service (SECURITY.md non-negotiable #6). Every
access path — tRPC routers, public API, automations, AI workers — asks
`can(principal, action)`; no module implements its own role checks.

## Public interface

- `can(principal, action): Decision` — pure, deny-by-default; every
  decision carries an audit-suitable `reason`.
- `PrincipalContext` — what callers must load: org role (from the identity
  module's `members`), workspace roles (from `workspace_members`), and the
  principal kind. Loading happens once at session resolution in the API
  layer; this package never queries.
- `Action` — the typed action vocabulary. New modules extend this union;
  every addition requires matrix rows in `service.test.ts` (the
  completeness check fails otherwise).

## Current rules (M1)

| Action                                 | owner | admin | member              | workspace admin adds | agent |
| -------------------------------------- | ----- | ----- | ------------------- | -------------------- | ----- |
| organization.update / invite-member    | ✓     | ✓     | ✗                   | —                    | ✗     |
| organization.delete                    | ✓     | ✗     | ✗                   | —                    | ✗     |
| organization.remove-member (non-owner) | ✓     | ✓     | ✗                   | —                    | ✗     |
| organization.remove-member (owner)     | ✓     | ✗     | ✗                   | —                    | ✗     |
| workspace.create / delete              | ✓     | ✓     | ✗                   | —                    | ✗     |
| workspace.view                         | ✓     | ✓     | if workspace member | ✓                    | ✗     |
| workspace.update / manage-members      | ✓     | ✓     | ✗                   | ✓ (own workspace)    | ✗     |

Agents are denied everything until scoped grants land (M3, TASK-0037) —
fail closed, never pseudo-human.

## Invariants

1. Pure and framework-free: no I/O, no db, no HTTP types.
2. Deny by default; unknown context denies.
3. Object-level and record-level grants (data-model.md §5) extend this
   service in M2+; they must not fork it.
