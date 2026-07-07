# ADR-0007: Jobs & durable execution — Trigger.dev v4 as the single substrate

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** CTO
- **Tags:** backend, ai, infra

## Problem

Drovano needs background execution for two workloads with different
shapes: classic jobs (email/calendar sync, webhooks, indexing, exports)
and **AI workers**, whose side-effecting steps must be journaled,
resumable, and gateable on human approval (ai-system.md §1). Decide
whether these share one substrate and which. Forces: agent runs are
long-lived and interruptible; approvals are waitpoints; self-hostability
is a cost/control hedge; small team → minimize distinct infrastructures.

## Alternatives considered

### Option A — Trigger.dev v4 for everything

- TS-native durable execution: journaled steps, checkpoint/resume, no
  task timeouts, waitpoints (approvals), cron, queues — one mental model
  for jobs _and_ agents.
- **Officially supported self-hosting** (Docker Compose + production Helm
  chart) — the exit hatch; cloud pricing sane (free 10k runs/mo, Pro
  $50/mo).
- Used by the direct reference class: Cal.com, Midday, MagicSchool AI.
- Weaknesses: younger than Temporal; a platform dependency in the
  critical path of every AI action.
- Evidence: research §4 (verified 2026-07-06: SDK 4.5.0, v4 GA,
  self-hosting docs) and §6 (durable execution mandatory for agent side
  effects).

### Option B — pg-boss (Postgres-only jobs) + something else for agents

- Zero new vendors for MVP jobs; right when Postgres is the only
  stateful dependency.
- But it's a queue, not durable multi-step execution — agents would need
  a second system anyway, defeating the single-substrate goal. Poll-based
  queues also keep scale-to-zero Postgres awake (Neon cost interplay).

### Option C — Temporal

- The durability gold standard; enterprise-proven.
- Weaknesses: highest conceptual load (deterministic workflows, worker
  versioning); an infrastructure team's tool. Wrong cost/benefit at our
  stage; named as the earned upgrade.

### Option D — Inngest

- Event-driven durable steps with agent primitives; good DX.
- Weaknesses: self-hostability unverified against current official docs;
  step-based pricing compounds badly on chatty LLM workflows (every tool
  call is a step).

### Option E — BullMQ (+ Redis)

- Mature raw-throughput queueing; but queueing ≠ durable execution, adds
  a Redis SPOF to the write path, and solves neither approvals nor
  resume.

## Research

`docs/research/technology-stack-2026.md` §4 (jobs) and §6 (AI durable-
execution requirement; Anthropic long-running-agent harness guidance).
Both research threads independently converged on Trigger.dev — noted as a
confidence signal.

## Decision

Trigger.dev v4 is the single background-execution substrate: all jobs and
all AI-worker runs are Trigger.dev tasks; every side-effecting agent step
is a journaled durable step; human approvals are waitpoints; start on
their cloud, keep the self-host deployment tested as the exit.

## Why this option

1. One substrate for jobs + agents halves the operational surface and
   makes the "agent side effects are journaled" rule (ARCHITECTURE.md
   principle 4) structural rather than disciplinary.
2. Waitpoints map 1:1 to the PRD's human-gated consequential actions.
3. Self-hosting keeps cost and control exits open — the vendor can't
   hold the agent layer hostage.
4. Reference-class adoption (Cal.com, Midday) de-risks the choice at our
   exact scale.

## Trade-offs accepted

- Vendor in the critical path (mitigated: exercised self-host path;
  tasks are plain TS functions — the harness, not the logic, is
  Trigger-shaped).
- Not the enterprise-grade determinism of Temporal (acceptable: our
  workflows are hours-scale, not months-scale).
- Task payloads must carry tenant context explicitly (codified in
  multi-tenancy.md §3 with one blessed helper).

## Future impact

- Easier: adding workers/automations (same substrate); usage metering of
  agentic work (runs are already journaled); session logs (PRD trust
  feature) fall out of run telemetry.
- Harder: a future migration would touch every background workflow —
  keep task bodies thin over module operations.
- Revisit: workflows spanning days across services at enterprise scale
  (Temporal); self-host trigger = cloud pricing or data-locality demands;
  AI SDK v7 WorkflowAgent maturing into an alternative for agent-shaped
  runs (watch, don't split substrates).
