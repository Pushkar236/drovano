# ADR-0014: Language-model supply — OpenRouter free tier until a first-party key exists

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** CTO (provider directed by the founder: OpenRouter key supplied, free models mandated)
- **Tags:** ai, infra

## Problem

ADR-0010 routes language calls through logical tiers
(`fast`/`balanced`/`frontier`) and named Anthropic as the language
provider. No Anthropic API key exists; the founder supplied an
OpenRouter key with the direction "use free and good models". Live AI
runs (TASK-0036 evals, TASK-0038/0039 workers) are otherwise blocked.
Forces: the zero-cost mandate, ADR-0010's requirement that provider
changes are config rather than code at call sites, and honest quality
expectations — free community models are below Claude tiers.

## Alternatives considered

### Option A — Wait for an Anthropic key

- Summary: keep language disabled; ship stub-tested code only.
- Strengths: no quality compromise; no new dependency.
- Weaknesses: blocks every live-model milestone indefinitely; wastes a
  working key the founder already provided.

### Option B — OpenRouter as the only provider

- Summary: replace the Anthropic path outright.
- Strengths: one code path.
- Weaknesses: throws away the researched ADR-0010 choice; a future
  Anthropic key should win automatically, not require a code change.

### Option C — OpenRouter free tier as a fallback provider (chosen)

- Summary: the router prefers Anthropic when its key exists, else
  serves tiers from OpenRouter's OpenAI-compatible endpoint pinned to
  free, tool-capable models; per-tier env overrides
  (`OPENROUTER_*_MODEL`) absorb catalog rotation.
- Strengths: unblocks live runs at zero cost today; upgrade path is
  "set ANTHROPIC_API_KEY"; call sites unchanged (tiers, not model ids).
- Weaknesses: free endpoints are shared pools — upstream 429s are
  normal under congestion; free-tier account limits (~50 requests/day
  without balance) cap throughput; model quality varies.

## Decision

Option C. Tier defaults (verified tool-capable via catalog query and a
live tool-loop smoke test, 2026-07-08): `fast` =
`openai/gpt-oss-20b:free`, `balanced` =
`nvidia/nemotron-3-super-120b-a12b:free`, `frontier` =
`openai/gpt-oss-120b:free`. OpenRouter is wired through
`@ai-sdk/openai`'s `.chat()` (chat-completions protocol). Embeddings
are unchanged: OpenAI-only (OpenRouter has no embeddings API), so
retrieval stays BM25-only until an OpenAI key exists.

## Consequences

- Workers and evals can run live at zero cost; expect and tolerate
  upstream 429s (callers retry or fall back; heavy eval batches should
  respect the daily free-request budget).
- Quality ceilings are real: prompt-injection resistance and tool-call
  reliability of free models are weaker than Claude's — the TASK-0037
  trust envelope (grants, proposals, spend caps) is the mitigation, and
  no additional agent autonomy should be granted on the strength of
  free-model behavior.
- Revisit when an Anthropic (or other first-party) key arrives — the
  router already prefers it; this ADR then simply stops applying.
