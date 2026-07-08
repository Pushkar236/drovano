# ADR-0013: Enrichment data supply — direct providers behind an owned waterfall (PDL first, Apollo second)

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** CTO
- **Tags:** ai, backend, data

## Problem

Zero-entry CRM (PRD §3.2, open question §9.2) fills firmographic and
person attributes automatically: domain → company profile, email →
person/role. TASK-0040 (M3) builds the enrichment waterfall; this ADR
picks the data supply and the waterfall order. Forces: unit economics
must fit bundled per-seat pricing (PRD §7 assumes capped enrichment per
seat), zero cost until the feature ships, and the graph's provenance
rule — enriched values are proposals with source attribution, never
silent truth.

## Alternatives considered

### Option A — Aggregator/waterfall SaaS (SyncGTM, BetterContact)

- Summary: one vendor that fans out to 15-50 upstream providers.
- Strengths: best match rates out of the box; zero waterfall code.
- Weaknesses: $99-649/mo subscriptions or ~$0.15-0.40 per full
  enrichment — a fixed platform cost before the feature earns anything;
  another vendor between us and data provenance; the waterfall logic is
  exactly the kind of thin orchestration we can own in a day (retry
  order + field merging over a provider interface).
- Evidence: [waterfall pricing survey](https://derrick-app.com/b2b-data-providers/pricing-comparison),
  [enrichment API comparison](https://www.autobound.ai/blog/best-b2b-data-enrichment-apis).

### Option B — Clearbit / Breeze Intelligence

- Summary: the classic API-first enricher, post-HubSpot acquisition.
- Weaknesses: standalone API access is now effectively enterprise-only
  (six figures annually); consumer-grade tiers are locked into the
  HubSpot ecosystem. Non-starter at our stage.
- Evidence: [enrichment API comparison](https://www.autobound.ai/blog/best-b2b-data-enrichment-apis).

### Option C — People Data Labs (PDL), direct

- Summary: pure data API — person + company enrichment endpoints,
  credit-per-successful-match billing.
- Strengths: **charges only on match** (HTTP 200 = 1 credit); free tier
  (100 lookups/mo) covers development; self-serve Pro at $98/mo — 350
  person credits + 1,000 company lookups (~$0.20-0.28/person record,
  company lookups far cheaper); 70M+ company profiles for the
  domain→firmographics path which is v1's core; clean JSON built for
  exactly this use.
- Weaknesses: free tier redacts emails/phones (fine — v1 enriches
  firmographics + role, not contact discovery); person coverage/match
  rates below aggregator fan-outs.
- Evidence: [PDL pricing & credits](https://support.peopledatalabs.com/hc/en-us/articles/25794271805211-Pricing-credits),
  [PDL company enrichment API](https://www.peopledatalabs.com/company-data/enrichment-api),
  [PDL review](https://syncgtm.com/blog/people-data-labs-review).

### Option D — Apollo.io API

- Summary: 275M-contact database with an enrichment API.
- Strengths: 10,000 free credits for testing; cheapest entry point in
  the category for person/contact data; good as a second source where
  PDL misses.
- Weaknesses: API access rides seat plans (Professional, ~$79/user/mo)
  rather than pure usage; ToS lean toward sales-engagement usage —
  re-verify redistribution terms before production use.
- Evidence: [enrichment API comparison](https://www.autobound.ai/blog/best-b2b-data-enrichment-apis),
  [B2B provider pricing](https://derrick-app.com/b2b-data-providers/pricing-comparison).

## Research

Gathered 2026-07-08 (prices/tiers move; re-verify at TASK-0040 start).
Market cost anchors: raw single-provider APIs $0.01-0.30/record;
aggregator waterfalls $0.15-0.40/full enrichment; Clearbit standalone
now enterprise-only. PDL free tier: 100 lookups/mo, credits consumed
only on successful match.

## Decision

**Own a thin waterfall behind an `EnrichmentProvider` interface; ship v1
with PDL as the sole provider (company-first: domain → firmographics,
then person by work email), and add Apollo as the second step in the
waterfall when match-rate data proves the gap is worth a second
contract.**

## Why this option

1. **Unit economics** — pay-per-match with no platform fee is the only
   model that fits "capped enrichment per seat" bundle math from day
   one; $0 until users enrich.
2. **Provenance** — direct provider calls give one clear source per
   value for the proposal/audit trail; an aggregator hides which vendor
   said what.
3. **The waterfall is ours anyway** — provider order, field precedence,
   and per-seat caps are product decisions; owning the executor (a
   provider interface + ordered fallback, mirroring ADR-0012's adapter
   discipline) costs a day and saves a subscription.

## Trade-offs accepted

- Lower person match rates than a 50-provider fan-out — acceptable: v1's
  value is firmographics on companies, where PDL is strong.
- Two provider contracts eventually instead of one aggregator bill.
- We maintain the waterfall executor (small, tested, ours).

## Future impact

- Easier later: adding/reordering providers (interface + config), field
  precedence rules per attribute, per-seat metering hooks.
- Harder later: nothing structural — an aggregator can even become just
  another provider behind the same interface.
- Revisit when: measured match rate < ~60% on real tenant data, PDL
  pricing shifts, or enrichment volume justifies negotiated enterprise
  rates.
