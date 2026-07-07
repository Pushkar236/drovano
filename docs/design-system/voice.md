# Voice — Microcopy Rules

> **Status:** v1.0, 2026-07-07 (TASK-0015). Governing contract:
> [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) (personality, rule 9,
> AI surface rules). Applies to every surface: product, empty/error
> states, emails, API error messages.

## 1. The voice

Calm, precise, first-person-plural absent: Drovano speaks plainly about
what happened and what to do — like a competent colleague, not a mascot.

- Sentence case everywhere (buttons, titles, labels). No exclamation
  marks in the product; no "Oops", "Uh oh", "Whoops".
- Verbs on buttons: "Create record", "Send invitation" — never "OK",
  "Yes", "Submit".
- Numbers, dates, and IDs are content, not prose: mono, tabular, exact.
- No blame, no cuteness, no filler ("simply", "just", "please note").

## 2. The three unloved states (rule 9)

**Empty** = headline (what this surface is) + one line (what it's for) +
one action. Per-scenario: first-run empties invite ("Connect your email
to start building your graph"), filtered empties clarify ("No deals match
these filters") with a reset action.

**Loading**: skeletons carry no copy. Blocking actions label the wait on
the control itself ("Saving…") — the Button loading state, never a modal
spinner with prose.

**Error** = what happened + why (if known) + what to do, in one or two
sentences, with a retry/repair action. Never raw internals, codes-only,
or "Something went wrong" without a next step.

> ✅ "This invitation has expired. Ask an admin to send a new one."
> ❌ "Error 410: resource gone."

Validation errors name the fix: "Password needs at least 12 characters",
not "Invalid password".

## 3. AI attribution (DESIGN_SYSTEM.md §3)

- Every AI-produced artifact is labeled by **worker name + basis**:
  "Drafted by Meeting assistant from the Oct 12 call" — never a sparkle
  icon alone, never unattributed.
- Provisional state is explicit: "Suggested — accept ⏎ / dismiss esc".
- Agent activity is reported in past-tense fact: "Record keeper updated
  2 fields from yesterday's email", with provenance one interaction away.
- AI uncertainty is stated, not hidden: "Low confidence — verify the
  amount" beats silent guessing. The model never says "I".

## 4. Destructive and consequential copy

Confirmations state the object and the consequence, and the confirm
button repeats the verb: title "Delete 'Acme renewal'?", body "This
removes the deal and its timeline for everyone. This can't be undone.",
buttons "Cancel" / "Delete deal". Consequential AI actions (send, share,
spend) always show exactly what will happen before a human confirms
(PRD §3.5).

## 5. Emails

Subject = the fact ("You've been invited to Torvalds LLC on Drovano").
Body: one purpose, one link, one paragraph of context, no marketing in
transactional mail. The identity module's templates follow this file.
