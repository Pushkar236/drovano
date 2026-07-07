# Drovano Documentation Map

Documentation is part of the product. Every document below has an owner
concept: if code changes make it wrong, fixing it is part of that change.

## Root documents (the contract)

| Document | Answers |
|---|---|
| [`PROJECT.md`](../PROJECT.md) | What is Drovano, for whom, and why now |
| [`ROADMAP.md`](../ROADMAP.md) | What we build, in what order, and why |
| [`ARCHITECTURE.md`](../ARCHITECTURE.md) | How the system is shaped (summary; details below) |
| [`DECISIONS.md`](../DECISIONS.md) | Index of every recorded decision |
| [`DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md) | The design language and its rules |
| [`CODING_STANDARDS.md`](../CODING_STANDARDS.md) | How code is written here |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | How work flows into the repository |
| [`SECURITY.md`](../SECURITY.md) | Security principles and practices |
| [`TESTING.md`](../TESTING.md) | What "tested" means here |
| [`CHANGELOG.md`](../CHANGELOG.md) | What changed, per release |

## docs/

| Directory | Contents |
|---|---|
| `PRD.md` | Product Requirements Document (v1 scope) |
| `architecture/` | Detailed architecture: system overview, tenancy, data model, AI system |
| `decisions/` | Architecture Decision Records (ADR-NNNN), one file per decision |
| `research/` | Dated research reports that informed decisions (inputs, not truth — they go stale) |
| `design-system/` | Design foundations: principles, tokens philosophy, interaction standards |
| `prompts/` | Record of each build prompt/milestone mandate and its handoff brief |
| `tasks/` | Backlog and task specifications |
| `templates/` | ADR, RFC, and task templates |

## Rules

1. **Decisions live in ADRs.** Research reports inform; ADRs decide. Never
   cite a research file as the reason for behavior — cite the ADR.
2. **One source of truth per fact.** Documents link to the owning document
   rather than restating its content.
3. **Dated documents don't get edited silently.** Research reports are
   snapshots; corrections happen in new ADRs or new reports.
4. **Status headers.** ADRs and RFCs carry explicit status; superseding a
   decision updates the old record's status.
