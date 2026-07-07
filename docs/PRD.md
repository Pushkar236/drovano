# Drovano v1 — Product Requirements Document

> **Status:** v1.0, 2026-07-07. Owned by product/CTO. Scope changes to this
> document require updating `ROADMAP.md` and affected tasks in
> `docs/tasks/BACKLOG.md`.
> **Inputs:** [`PROJECT.md`](../PROJECT.md) (vision),
> [`docs/research/ai-native-platform-landscape.md`](research/ai-native-platform-landscape.md)
> (market evidence), [`docs/research/premium-saas-design-language.md`](research/premium-saas-design-language.md)
> (design evidence). Technical feasibility is governed by
> [`ARCHITECTURE.md`](../ARCHITECTURE.md) and the ADRs in
> [`DECISIONS.md`](../DECISIONS.md).

## 1. Product thesis

Drovano is an AI-native Business Operating System. v1 ships the **CRM +
meeting-intelligence wedge on the full platform substrate**: the object
graph, permission model, audit system, and AI-worker infrastructure are
built platform-grade from day one, but the packaged, sellable product is a
relationship system that maintains itself.

Why this wedge (evidence in the landscape research):

- Meeting/deal intelligence is where AI-for-revenue demonstrably worked
  (Granola, Sybill, Attio Call Intelligence), while AI-SDR "digital
  workers" collapsed on churn. We augment judgment and own the data layer;
  we do not impersonate an employee.
- The #1 reason incumbent AI agents fail is dirty data (MIT: 95% of pilots
  show no P&L impact; Salesforce ecosystem: ~77% of B2B Agentforce
  implementations fail, mostly on data quality). A graph that is clean
  because AI maintains it from day zero is the structural advantage.
- The "opinionated defaults + relational depth + AI-native + whole-business
  scope at SMB price" quadrant is unoccupied: Attio is GTM-only with weak
  reporting, Day.ai lacks structured reliability, HubSpot has had three
  pricing regimes in two years, Airtable retreated from SMB.
- monday.com proved the expansion playbook: CRM to $100M ARR in three
  years on a shared multi-product substrate.

**The AI-native test we hold ourselves to:** remove the AI and Drovano v1
must collapse — no manual-entry fallback product is hiding underneath.

## 2. Who it's for

**ICP:** SMB and mid-market B2B teams, 5–200 seats, that have outgrown
spreadsheets/lightweight CRMs but find enterprise suites heavy, ugly, and
dumb. Sales-led or founder-led motions with meetings at the center of the
deal cycle.

| Persona                     | Role in purchase   | What they need from v1                                                                                   |
| --------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| **Founder / sales lead**    | Buyer + daily user | Pipeline truth without nagging the team to update records; follow-ups that never slip                    |
| **Account executive / CSM** | Daily user         | Meeting prep in one place; notes, follow-ups, and record updates done for them; fast keyboard-first UI   |
| **RevOps / ops lead**       | Champion + admin   | Custom objects/fields/views without consultants; trustworthy data; reporting that doesn't require export |
| **AI worker** (non-human)   | Operator           | Typed, permissioned, audited operations; retrieval scoped to its grantor's permissions                   |

The fourth persona is deliberate: every capability below must be specified
as an operation both a human and an agent can perform (PROJECT.md, law 2).

## 3. v1 scope by module

Modules build on the shared object graph (`docs/architecture/data-model.md`).
"v1" = the first generally sellable release (end of M4 in `ROADMAP.md`).

### 3.1 Foundation (platform substrate — not user-visible as a "module")

- Identity: email/password (argon2id) + Google/Microsoft OAuth; MFA (TOTP);
  session management per `SECURITY.md`.
- Organizations → workspaces; invitations; roles (owner/admin/member +
  per-workspace); centralized permission service consulted by every module.
- **Agent identity:** AI workers are principals with their own identity,
  scoped permission grants, and visually distinct attribution — never
  pseudo-humans (Linear AIG is the reference standard).
- Append-only audit log covering every mutation by human or agent, queryable
  per record and per actor.
- Tenant isolation enforced in the database (RLS) as a backstop to
  application checks, per ADR-0006.

### 3.2 Relationships (CRM module)

- Standard objects: People, Companies, Deals; **custom objects** with typed
  attributes (text, number, currency, date, select, multi-select, relation,
  user, timestamp, checkbox, URL, email, phone).
- **Lists with list-scoped attributes** (process state lives on the list,
  not the record — the Attio-validated pattern) and saved views: table
  (virtualized, inline edit, full keyboard grid) and kanban; filters, sorts,
  grouping.
- Relationship attributes create typed, bidirectional links across all
  objects (deals ↔ people ↔ companies ↔ meetings ↔ tasks ↔ documents).
- **Zero-entry capture:** two-way Gmail/Google Calendar and
  Outlook/Microsoft 365 sync auto-creates and auto-updates People and
  Companies; enrichment fills firmographic attributes; email/calendar
  activity lands on record timelines automatically.
- **AI attributes:** any attribute can be AI-computed with a prompt as its
  formula, refreshed on schedule or on trigger, always attributed and
  overridable (the convergent 2025 primitive: Attio AI attributes, folk
  magic fields, Airtable Field Agents).
- Activity timeline per record: emails, meetings, notes, tasks, attribute
  changes, agent actions — one append-only, filterable stream.
- Deal pipelines with opinionated default stages, editable per workspace.

### 3.3 Work (Tasks, Calendar, Meetings)

- Tasks: assignable (to humans or agents), due dates, relations to any
  record, my-day and per-record views. Not a project-management suite —
  no Gantt, sprints, or dependencies in v1.
- Calendar: read/write sync with Google/Microsoft calendars; meetings are
  first-class records related to People/Companies/Deals.
- **Meeting intelligence (the wedge feature):**
  - Recording/transcription via meeting-bot integration (vendor per
    ADR-0010 follow-up; own transcript storage).
  - AI produces: summary, extracted action items (proposed as tasks),
    attribute updates (proposed against the related Deal/Company/Person),
    and a drafted follow-up email — **all provisional until accepted**, one
    keystroke to accept, per `DESIGN_SYSTEM.md` §3.
  - Meeting prep brief: before each external meeting, the related records,
    open tasks, last conversations, and suggested talking points.

### 3.4 Knowledge (Documents & Notes)

- Notes on any record (rich text, block-based, real-time collaborative
  editing kept minimal: presence + concurrent editing on notes only).
- Documents workspace: pages with the same editor; relations to records.
- **Retrieval:** all notes, documents, transcripts, and emails are indexed
  (contextual + hybrid retrieval per ADR-0010) and queryable by humans
  (⌘K natural-language search) and agents (retrieval tool) — always scoped
  to the caller's permissions.
- Not in v1: wiki hierarchies, public sharing, document templates
  marketplace.

### 3.5 Intelligence (AI workers, Automation, Analytics)

- **AI workers v1 — three named, narrow, trustworthy workers** (breadth >
  depth killed the 2025 agent startups; we ship depth):
  1. _Record keeper_: maintains the graph from email/calendar/meeting
     signals; proposes merges/dedupes; fills AI attributes.
  2. _Meeting assistant_: everything in §3.3; owns prep briefs and
     follow-up drafts.
  3. _Research assistant_: on-demand web research to fill attributes and
     answer "tell me about this company" — with cited sources.
- Agent trust infrastructure (differentiator): per-worker permission
  scopes, session logs (what it read, what it did), reversibility for
  every write, spend caps per workspace, consequential actions
  (send/delete/external share/spend) always gated on a human unless
  explicitly delegated per action class.
- Automation: trigger → condition → action rules on graph events (record
  created/updated, stage changed, meeting ended, task overdue) with
  human-readable run logs. Natural-language rule creation drafts a rule the
  user confirms. No visual workflow-builder canvas in v1.
- Analytics: pipeline reporting (funnel, velocity, forecast category
  totals), activity reporting, and **NL querying over the graph** ("which
  deals are stuck in negotiation with no next step?"). Reporting depth is
  the universal weak spot of the modern-CRM cohort — v1 ships genuinely
  useful reporting, not a BI suite.

### 3.6 Platform (API surface)

- REST public API (OpenAPI-generated from the same schemas as the product,
  per ADR-0005), API keys scoped per workspace, webhooks for graph events.
- **MCP server** (tenant-scoped OAuth): Drovano's graph and operations
  available inside Claude/ChatGPT/Copilot — agent-legible in both
  directions.
- TypeScript SDK (generated).
- Not in v1: marketplace, embedded apps, SCIM (enterprise tier is
  post-v1 per `ROADMAP.md`; the architecture reserves the seams).

## 4. Table stakes vs differentiators

**Table stakes (absence disqualifies — all must be in v1):** contact/
company/deal management; pipeline views; custom fields; two-way email +
calendar sync; imports that work (CSV with mapping + dedupe); basic
automation; call transcription + AI summaries; enrichment; an AI assistant
that answers questions about your data; SSO-ready auth (Google/Microsoft);
roles/permissions; API + webhooks; transparent pricing.

**Differentiators (where v1 must win):**

1. **Zero-entry, self-maintaining records** with structured-graph
   reliability (Day.ai ambition, Attio discipline — nobody has both).
2. **Agent trust infrastructure** — identity, scopes, session logs,
   reversibility, spend caps. Currently nobody's strength; the 2026 buyer
   is skeptical and this converts.
3. **Speed as a feature** — Linear-class perceived performance
   (NFRs below), keyboard-first, ⌘K-centric.
4. **Reporting without export + NL querying** — the whole cohort's shared
   weakness.
5. **Unified cross-module context** — CRM + meetings + tasks + docs in one
   graph; the meeting assistant can see the deal, the notes, and the
   calendar; a point tool structurally cannot.
6. **Pricing honesty** (see §6).

## 5. Non-functional requirements

These are product requirements, not aspirations; they are enforced per
`TESTING.md` (budgets in CI from M1) and `SECURITY.md`.

**Performance budgets (p95 unless noted):**

| Surface                                          | Budget                               |
| ------------------------------------------------ | ------------------------------------ |
| Interaction acknowledgment (any click/keystroke) | < 100 ms perceived (optimistic UI)   |
| Navigation between views (warm)                  | < 200 ms                             |
| Record peek open                                 | < 150 ms                             |
| Table scroll                                     | 60 fps, virtualized, no layout shift |
| ⌘K open                                          | < 50 ms                              |
| API reads (single record)                        | < 150 ms p95 server-side             |
| API list queries (≤ 50 rows)                     | < 300 ms p95                         |
| AI: streamed first token (assistant surfaces)    | < 1.5 s                              |
| Meeting artifacts (summary, actions, drafts)     | < 2 min after meeting end            |
| Cold full-page load (app shell)                  | < 2.5 s on mid-tier hardware         |

**Security & privacy:** per `SECURITY.md` in full — RLS backstop, least
privilege, audit-everything, no training on tenant data, AI retrieval under
the caller's permission context, prompt-injection defenses for any agent
that reads untrusted content (Notion's exfiltration demo is the named
threat), envelope-encrypted tenant credentials (email/calendar OAuth
tokens are the crown jewels).

**Accessibility:** WCAG 2.2 AA encoded in design tokens per
`DESIGN_SYSTEM.md` rule 10; every mouse action keyboard-reachable; axe
checks in CI.

**Reliability:** RPO ≤ 24h / RTO ≤ 4h at v1 (SECURITY.md); graceful
degradation — AI-provider outage never blocks CRUD; sync-provider outage
never loses captured signals (durable queues).

**Scale targets for v1 architecture (not v1 load):** 100k+ tenants,
1M records per workspace without perceptible degradation, 10M+ vectors
before re-platforming retrieval (exits documented in ADR-0006/0010).

## 6. Pricing & packaging direction

Not final pricing — the packaging _shape_, chosen against the researched
failure modes (credit opacity, seat buckets, pricing-regime whiplash,
SSO ransom):

- **Transparent per-seat base in the $25–35 band** with AI genuinely
  bundled — meeting intelligence, AI attributes, assistant, and a generous
  included allowance of agentic work. Free tier: ≤ 3 seats, core CRM, taste
  of AI.
- **One usage meter** (a single unit for heavy agentic work), with a live
  usage view, hard caps, alerts, and rollover. Never multiple credit
  currencies.
- **No SSO ransom:** SAML SSO available on the standard paid tier;
  enterprise tier sells SCIM, audit export, residency, and silo isolation —
  not basic security.
- Human seats never gate agent value: AI workers act on workspace data
  regardless of who is looking.
- Revisit trigger: if agentic usage margins erode past sustainable,
  introduce named AI-worker SKUs priced well under human-labor anchors
  (Day.ai pattern) rather than inflating the meter.

## 7. Out of scope for v1 (explicit)

Email sequencing/campaigns; marketing automation; customer-support
ticketing; invoicing/billing modules; visual workflow-builder canvas;
marketplace & third-party apps; mobile native apps (responsive web only);
offline mode; SCIM/data residency/silo tenancy (enterprise tier, post-v1);
non-English localization; on-prem.

Each is a deliberate sequencing choice, not a never — the graph and
permission model must not preclude them.

## 8. Success metrics

**Activation (first session):** workspace connects email/calendar ≥ 70% of
signups; first AI-maintained record visible < 10 min after connect.

**The wedge works:** ≥ 60% of meeting artifacts (summaries/actions/drafts)
accepted with zero edits; ≥ 80% of records with zero manual field edits in
week 4 (the record updates itself).

**Trust:** AI-action reversal rate < 5%; zero cross-tenant data incidents
(hard gate, not a metric); agent session-log views per active workspace
(engagement with transparency, target: majority of admins view logs in
month 1 — trust is inspected, then assumed).

**Speed:** performance budgets green in CI and in field RUM p95.

**Business (first 6 months post-GA):** 100 paying workspaces; logo churn
< 3%/mo after month 2; NPS ≥ 40; ≥ 30% of workspaces using ≥ 2 modules
beyond CRM (the OS bet, measured).

## 9. Assumptions & open questions

Tracked here; resolution recorded in ADRs or PRD revisions.

1. **Meeting-bot vendor vs native capture** — build-vs-buy analysis due in
   M2 (affects COGS and privacy posture). Assumption: buy first.
2. **Enrichment data supply** — waterfall via 1–2 providers; unit economics
   must fit bundled pricing. Assumption: cap enrichment per seat, meter
   overflow.
3. Day.ai pricing ($75/AI assistant) is unverified; our packaging doesn't
   depend on it.
4. **EU data residency demand** may arrive earlier than the enterprise
   tier; Neon region choice hedges (ADR-0006).
5. Slack capture (a Day.ai signal source) is deferred to post-v1 —
   validate demand before building.
6. NL rule creation and NL querying quality on messy real workspaces is
   the largest product risk; both fall back to manual builders/filters.
