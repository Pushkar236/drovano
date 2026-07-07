# Drovano

**An AI-native Business Operating System.**

Drovano is the single place where a business runs: its relationships, its
deals, its work, its knowledge, and — critically — its AI workforce. CRM is
the first module, not the product.

## The problem

A typical growing business runs on 10–20 disconnected tools: a CRM, a task
tracker, a calendar, a docs tool, a meeting notetaker, an email sequencer,
plus a growing pile of single-purpose AI point solutions. The result:

- **Fragmented context.** The customer's story is scattered across tools
  that don't share a data model. Nobody — human or AI — sees the whole
  picture.
- **Manual glue.** People are the integration layer: copying data, updating
  records, writing summaries, chasing follow-ups.
- **AI bolted on.** Incumbent suites attach chatbots to twenty-year-old data
  models. The AI can autocomplete an email but cannot _do the work_, because
  the systems it would need to act on were never designed for a non-human
  operator.

## The bet

Software built AI-native — where every object, permission, and action is
designed to be operated by both humans and AI agents — will replace suites
where AI is a feature. The unit of value shifts from "a system of record you
update" to "a system that runs work for you and shows you the record."

Drovano's core wager: **the company that owns the unified business graph
(people, companies, deals, work, documents, conversations) in one permission
model will own the AI workforce layer**, because agents are only as good as
the context and the levers they are given.

## What Drovano is

One platform, one data graph, one permission model, many modules:

- **Foundation:** Identity, Organizations, Workspaces, Permissions, Audit
- **Relationships:** Contacts, Companies, Deals, Activities (the CRM module)
- **Work:** Tasks, Calendar, Meetings
- **Knowledge:** Documents, Notes, Knowledge base with retrieval
- **Intelligence:** AI Workers (agents with scoped permissions and audited
  actions), Automation, Analytics
- **Platform:** Public API, SDKs, Webhooks, Marketplace, Enterprise
  (SSO/SCIM, audit export, data residency)

Every module obeys three laws:

1. **One graph.** Every record can relate to every other record; context is
   never trapped in a module.
2. **Agent-operable.** Every action a human can take is a typed, permissioned,
   audited operation an AI worker can take — with the same authorization
   rules, always attributable, never silent.
3. **Premium by default.** Fast, keyboard-first, beautiful, accessible.
   Software people _want_ to live in.

## Who it's for

Initial wedge: **SMB and mid-market B2B teams (5–200 seats)** who have
outgrown spreadsheets and lightweight CRMs but find enterprise suites heavy,
ugly, and dumb. The buyer is a founder, RevOps lead, or head of sales; the
daily user is anyone who touches customers.

## Product principles

1. **AI does work, humans direct it.** Agents draft, enrich, schedule,
   summarize, and follow up; humans set intent and approve consequences.
   Trust is earned through transparency (every AI action is visible,
   attributable, reversible where possible).
2. **The record updates itself.** Data entry is a failure state. Email,
   calendar, and meeting signals keep the graph current automatically.
3. **Speed is a feature.** Sub-100ms interactions, keyboard-first,
   command-palette-centric. Waiting is a bug.
4. **Opinionated defaults, deep customization.** Works in five minutes with
   zero config; grows custom objects, fields, views, and automations without
   consultants.
5. **Trustworthy by design.** Tenant isolation in the database, least
   privilege, audit everything, no training on customer data.

## Where we are

Pre-code. The engineering foundation (this repository's documentation set)
is complete; implementation begins with milestone M1 per
[`ROADMAP.md`](ROADMAP.md). Product scope for v1 is defined in
[`docs/PRD.md`](docs/PRD.md). Technical shape is defined in
[`ARCHITECTURE.md`](ARCHITECTURE.md) and governed by the ADRs indexed in
[`DECISIONS.md`](DECISIONS.md).

## Company operating norms

- Documentation-first: see [`docs/README.md`](docs/README.md).
- Decisions are recorded: see [`DECISIONS.md`](DECISIONS.md).
- Quality bars are non-negotiable: see [`CODING_STANDARDS.md`](CODING_STANDARDS.md),
  [`TESTING.md`](TESTING.md), [`SECURITY.md`](SECURITY.md).
