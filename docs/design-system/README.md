# docs/design-system/

The design language contract lives at the repository root:
[`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) ("Strata"). This directory holds
the concrete, evolving specifications beneath that contract.

Produced during M1 (see `ROADMAP.md` and `docs/tasks/BACKLOG.md`):

| File (planned)   | Contents                                                                                                                  | Producing task |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `tokens.md`      | Full DTCG token set: OKLCH neutral + ember ramps, spacing, type scale, motion, elevation — with contrast validation table | TASK-0011      |
| `typography.md`  | Typeface evaluation results and final selection, scale, numeral rules                                                     | TASK-0012      |
| `components/`    | One spec per component: anatomy, states (incl. empty/loading/error where relevant), keyboard model, a11y notes            | TASK-0013+     |
| `interaction.md` | Keyboard map, command surface (⌘K) specification, focus management rules                                                  | TASK-0014      |
| `voice.md`       | Product voice: microcopy rules for states, errors, AI attribution                                                         | TASK-0015      |

Research inputs: `docs/research/premium-saas-design-language.md` (snapshot,
2026-07-06). Decisions: ADR-0009.
