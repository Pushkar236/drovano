# Data Model — the Object Graph

> **Status:** v1.0, 2026-07-07. Product scope: [`docs/PRD.md`](../PRD.md) §3.
> Market evidence for the pattern:
> [`ai-native-platform-landscape.md`](../research/ai-native-platform-landscape.md)
> (Part B §2). Tenancy rules: [`multi-tenancy.md`](multi-tenancy.md).
> This document defines concepts and invariants; the physical schema is
> produced in M1–M2 (baseline: TASK-0007; object graph: TASK-0021+) and
> lives in `packages/db`.

## 1. Design position

The research shows the industry converged on a winning shape; Drovano's
model is a deliberate synthesis:

> **Structured object graph as the skeleton** (Attio-validated:
> objects/records/attributes/lists) **+ append-only context stream as the
> flesh** (timeline/activity as the AI's feed) **+ AI workers maintaining
> the mapping between them** (extraction from unstructured → structured,
> always attributed and provisional).

This gives Day.ai-class zero-entry ambition with structured-graph
reliability — the combination nobody has shipped (PRD §4).

## 2. Core primitives

### Objects
Typed blueprints for records. **Standard objects** (Person, Company, Deal,
Meeting, Task, Note, Document) ship with opinionated defaults and
non-removable system attributes; **custom objects** are user-defined.
Standard objects can be extended but not broken — module code may rely on
system attributes existing.

### Attributes
Typed columns defined on an object *or on a list* (see Lists). Types (v1):
text, number, currency, date, timestamp, checkbox, select, multi-select,
URL, email, phone, user, **relation**, and **AI-computed** (any base type
+ a prompt-as-formula + refresh policy). Attribute definitions are
records themselves (metadata is data): id, object/list scope, type,
constraints, default, archived flag. Attribute *values* are stored
typed (see §5).

### Records
Instances of an object. Every record: `id` (uuidv7), `tenant_id`,
object id, created/updated provenance (which principal — human, agent, or
integration), soft-delete state. Merge/dedupe is a first-class operation
(the record keeper proposes; humans confirm; merges are auditable and
reversible within a retention window).

### Relations
Typed, **bidirectional** links between records, defined as relation
attributes (one-to-one, one-to-many, many-to-many). Both directions are
queryable and viewable. Cross-object by design: a Meeting relates to
People, a Company, a Deal; a Task relates to anything. This is the "one
graph" law — context is never trapped in a module.

### Lists & views
**Lists** are curated subsets of one object's records with **list-scoped
attributes**: process state (e.g., "Q3 outbound stage") lives on the list
entry, not the record — entity truth and workflow state never pollute each
other (Attio's signature choice, adopted deliberately). **Views** are
saved configurations (table/kanban; filters, sorts, grouping, visible
columns) over an object or list. Pipelines are lists with stage semantics.

### Timeline (the context stream)
Per-record, append-only, multi-channel stream: emails, meeting artifacts,
notes, calls, attribute changes, task events, **agent actions**. Entries
carry actor provenance and links to source artifacts (transcript, email).
The timeline is simultaneously the human-facing history and the **AI's
context feed** — retrieval indexes it (ai-system.md §4). It is derived
from and linked to, but distinct from, the audit log (audit is the
security record of every mutation; timeline is the curated activity
narrative — audit is never editable, timeline entries can be redacted with
an audit trail).

## 3. Invariants

1. Every record, attribute value, timeline entry, and embedding row
   carries `tenant_id` (multi-tenancy.md).
2. **One write path:** all mutations go through the owning module's typed
   operations — UI, API, automation, and AI workers included. No module
   writes another module's tables.
3. Every mutation records provenance (principal id + kind:
   human/agent/integration/system) and lands in the audit log
   transactionally.
4. AI-written values are **provisional until accepted** where the surface
   demands it (meeting extractions), or **attributed and overridable**
   where ambient (AI attributes); a human override pins the value against
   silent AI rewrite.
5. Relations are referentially intact: deleting a record tombstones its
   relation edges; timelines never dangle.
6. Schema changes by users (custom objects/attributes) are **row
   operations, not DDL** — tenant provisioning and customization never
   run migrations.

## 4. Storage strategy (physical, decided at ADR level)

- **Standard objects get concrete tables** (`people`, `companies`,
  `deals`, …) with system attributes as real columns — hot paths get real
  indexes, real types, real query plans.
- **Custom objects and custom attributes use a records + typed-EAV
  hybrid:** a `records` table per tenant-shared schema plus an
  `attribute_values` table with one typed column per value kind (not
  a single JSONB blob), indexed `(tenant_id, attribute_id, value_*)`.
  JSONB is reserved for genuinely unstructured payloads (webhook bodies,
  provider raw data).
- Rationale: pure-EAV everything sacrifices the hot-path performance the
  NFRs demand; pure-concrete everything makes user customization DDL.
  The hybrid is what Attio-class systems converge on. Validated against
  the 1M-records-per-workspace NFR with benchmarks in M2 (TASK-0021).
- **Embeddings live in separate per-domain tables** (`note_embeddings`,
  `transcript_embeddings`, …) on pgvector — never on the source row
  (ADR-0010; keeps HNSW indexes small and the Turbopuffer exit clean).
- Counts/rollups that reporting needs are maintained transactionally or
  via CDC-fed summaries — never computed by scanning at read time on hot
  paths.

## 5. Permissions on the graph

Resolution order: workspace membership → role → object-level grants →
(post-v1: record-level grants — the model reserves the seam; the research
notes row-level permissioning arrived late everywhere and agents make it
urgent). Agent principals hold **scoped grants** (objects + operations +
optional list scope) issued by a human grantor; retrieval and list queries
for agents apply the same filters as for their grantor, intersected with
the agent's scope. The permission service is one pure package
(`packages/permissions`) consulted by every path; its decisions are
cacheable and its allow/deny matrix is exhaustively tested (`TESTING.md`).
