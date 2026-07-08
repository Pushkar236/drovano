# ADR-0015: Embeddings supply — local open-source model until a hosted key exists

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** CTO (direction from the founder: "use free opensource models instead that I can replace later")
- **Tags:** ai, data, infra

## Problem

Retrieval (TASK-0035) shipped BM25-only because dense search was pinned
to OpenAI `text-embedding-3-small` (ADR-0010) and no OpenAI key exists.
The founder wants dense retrieval now, on free open-source models, with
a later swap path. Forces: zero cost, the existing `Embedder` seam, and
the physics of embeddings — vectors from different models are
incomparable, so ANY model swap means re-embedding everything plus a
dimension migration; there is no swap-without-reindex option to design
for.

## Alternatives considered

### Option A — Free hosted embedding APIs (Jina, Gemini free tier)

- Summary: call a hosted embeddings endpoint with a free-tier key.
- Strengths: no local compute or memory; strong models.
- Weaknesses: another account/key to provision; free tiers are
  rate-limited and revocable; still a per-call network dependency.

### Option B — Local ONNX model via transformers.js (chosen)

- Summary: `bge-small-en-v1.5` (384 dims, ~35 MB quantized) runs
  in-process on CPU through `@huggingface/transformers`.
- Strengths: zero cost, zero keys, works offline after the first model
  download; MIT-licensed model with strong MTEB retrieval scores for
  its size; lives behind the existing `Embedder` seam.
- Weaknesses: adds ~150–200 MB peak memory to the API process — may
  not fit Render's 512 MB free tier next to the app (mitigation:
  `EMBEDDINGS=off` env switch); English-focused model; quality below
  large hosted embeddings.

## Decision

Option B. `createLocalEmbedder()` in `@drovano/retrieval` (lazy model
load; nothing paid at import). Precedence in the API: OpenAI hosted
embeddings when `OPENAI_API_KEY` exists, else local, and
`EMBEDDINGS=off` disables dense search for memory-tight hosts. The
`chunks.embedding` column moves to `halfvec(384)` (migration 0014 —
free, the column was never populated).

## Consequences

- Dense + hybrid retrieval works today at $0 with no external calls.
- Swapping to a hosted model later = set the key, migrate dimensions,
  re-embed all chunks. That re-embedding cost exists regardless of
  today's choice.
- Watch API memory on small hosts; if the Render free instance OOMs,
  set `EMBEDDINGS=off` there and keep local embeddings in dev until
  the instance is upgraded.
