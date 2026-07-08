# ADR-0012: Meeting capture — buy the bot infrastructure (Recall.ai), own the interface

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** CTO
- **Tags:** ai, backend, infra

## Problem

The meeting-intelligence wedge (PRD §3.3, open question §9.1) needs
recording + transcription of external meetings on Zoom, Google Meet, and
Microsoft Teams. TASK-0041 (M3) builds the assistant on top; before it
starts we must decide build-vs-buy for the capture layer: do we run our
own meeting bots or rent a meeting-bot API? Forces: a solo-founder-scale
team, the zero-cost-until-revenue directive, a < 2 min artifact latency
NFR (PRD §5), and the wedge's centrality — capture reliability IS the
product's first impression.

## Alternatives considered

### Option A — Native capture (build our own bots)

- Summary: headless-browser/SDK bots we run ourselves per platform.
- Strengths: no per-hour vendor margin; full control of media pipeline;
  no third-party processor for customer call audio (privacy posture).
- Weaknesses: three platforms × undocumented, shifting surfaces. Google
  Meet has **no official API** for real-time media; Zoom's SDK app
  approval takes weeks-to-months and its OAuth install flow adds user
  friction; Teams needs Graph + WebRTC plumbing. Industry reports put
  this at ~3-5 engineers to build AND operate, with months to first
  reliable capture — that is the whole company for a quarter, spent off
  the differentiating path.
- Evidence: [Recall.ai — how to build a meeting bot](https://www.recall.ai/blog/how-to-build-a-meeting-bot),
  [Gladia — building a Meet transcription bot](https://www.gladia.io/blog/building-a-google-meet-transcription-bot-step-by-step-api-integration-with-real-time-captions),
  [Nylas — recording APIs compared](https://www.nylas.com/blog/best-apis-for-recording-zoom-microsoft-teams-google-meet/).

### Option B — Recall.ai (meeting-bot API market leader)

- Summary: one API that joins/records/transcribes across Zoom, Meet,
  Teams, Webex, Slack Huddles; desktop SDK for botless capture later.
- Strengths: broadest platform coverage + strongest docs; 2026 pricing
  dropped to **$0.50/recording-hour pay-as-you-go with no platform fee**
  (+$0.15/hr built-in transcription) — $0 until we actually record;
  well-capitalized ($38M Series B), so vendor-death risk is low.
- Weaknesses: per-hour margin forever; our call audio transits a vendor
  (DPA/subprocessor disclosure needed); usage price is 43% above the
  cheapest rival.
- Evidence: [Recall.ai 2026 pricing](https://www.recall.ai/blog/new-recall-ai-pricing-for-2026),
  [meeting-bot API comparison](https://skribby.io/blog/meeting-bot-api-comparison-2026).

### Option C — Cheaper vendor (Skribby $0.35/hr, Meeting BaaS $0.69/hr incl. transcription)

- Summary: same rent-a-bot model, smaller vendors.
- Strengths: 30-50% cheaper per hour; Meeting BaaS bundles transcription.
- Weaknesses: narrower platform coverage and thinner track records; the
  wedge cannot afford flaky capture; switching TO a cheaper vendor later
  is easy behind our interface — starting on one is not obviously safe.
- Evidence: [Skribby comparison](https://skribby.io/blog/meeting-bot-api-comparison-2026),
  [Meeting BaaS vs Recall.ai](https://www.meetingbaas.com/en/blog/meeting-baas-vs-recall-ai).

### Option D — Open source self-hosted (Vexa)

- Summary: self-hosted OSS meeting bot.
- Weaknesses: **Google Meet only** (no Zoom/Teams) — fails the coverage
  requirement outright; meaningful DevOps burden; no support.
- Evidence: [OSS meeting bot survey](https://screenapp.io/blog/recall-ai-alternative-open-source-meeting-bot).

## Research

See per-option evidence links (gathered 2026-07-08; per-hour prices move
— re-verify before TASK-0041 implementation). Key numbers: Recall.ai
$0.50/hr + $0.15/hr transcription, no monthly fee; Skribby $0.35/hr;
Meeting BaaS $0.69/hr incl. transcription; native build ≈ 3-5 engineers
and ~3 months to a first reliable bot on ONE platform.

## Decision

**Buy: Recall.ai for capture + transcription, consumed through our own
`MeetingCapture` interface in the (future) meetings module — the vendor
is an adapter, never imported outside it.**

## Why this option

1. **Focus** — PROJECT law: spend engineering on the object graph and AI
   workers, not on re-deriving undocumented meeting-platform internals.
2. **Zero-cost fit** — usage-based with no platform fee means $0 spend
   until real meetings are recorded, which only happens when the wedge
   ships to users.
3. **Reliability over price** — capture failures poison the wedge; the
   market leader's coverage/track record is worth the $0.15/hr premium,
   and the interface keeps Skribby/Meeting BaaS one adapter away.

## Trade-offs accepted

- Per-hour vendor margin in COGS (~$0.65/recorded-hour all-in) — fine at
  bundle pricing (PRD §7) until volume proves otherwise.
- Customer call audio transits a subprocessor — disclose in the DPA;
  revisit native/desktop-SDK capture if enterprise deals demand it.

## Future impact

- Easier later: swapping vendors (interface), adding Webex/Huddles,
  botless desktop capture via the same vendor's SDK.
- Harder later: going native means rebuilding capture ops from zero.
- Revisit when: recorded volume makes vendor spend a top-3 COGS line
  (~>$1k/mo), the vendor destabilizes, or a flagship deal requires
  first-party-only audio handling.
