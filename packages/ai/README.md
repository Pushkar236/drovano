# @drovano/ai

The AI harness (ADR-0010, TASK-0034): deliberately thin — provider
routing, a bounded tool loop, run recording, and eval scaffolding.
Orchestration lives in workers (Trigger.dev durable steps), never here.

- **Router** — call sites ask for a tier (`fast` / `balanced` /
  `frontier`), the router picks the wire model. Language providers in
  precedence order: Anthropic (`ANTHROPIC_API_KEY`), else OpenRouter
  free tool-capable models (`OPENROUTER_API_KEY`; per-tier
  `OPENROUTER_*_MODEL` overrides — ADR-0014). OpenAI serves embeddings
  (neither Anthropic nor OpenRouter has an embeddings API). Missing
  keys disable the capability (`AiDisabledError`), boot never fails —
  same posture as `SENTRY_DSN`/`REDIS_URL`.
- **Tool loop** — `runToolLoop` wraps `generateText` with hard per-run
  caps (`maxSteps`, `maxOutputTokens` — ai-system.md spend rules) and
  records every run (tenant, worker, model, tokens, outcome) through the
  `RunRecorder` seam. TASK-0037's session logs and spend accounting plug
  in there.
- **Scenarios** — `defineScenario`/`runScenarios` (TASK-0036): the same
  scenario definitions run against stub models in CI (deterministic,
  free) and real models on a schedule once keys exist.
- **Testing** — `@drovano/ai/testing` provides stub language models
  (`textResponse`, `toolCallResponse`) over `ai/test` mocks. CI never
  calls a live model (TESTING.md AI rules).

Workers import `tool` from here (re-exported from the AI SDK) so `ai`
stays a single-upgrade-point dependency.
