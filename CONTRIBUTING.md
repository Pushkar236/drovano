# Contributing to Drovano

This document defines how work enters, moves through, and leaves this
repository. It applies to humans and AI agents equally.

## Ground rules

1. **Documentation-first.** Behavior-changing work starts from a task in
   `docs/tasks/`, governed by the PRD and architecture documents. If the
   documents don't cover what you're building, update the documents first.
2. **No demo code.** Everything merged is production-intent: typed, tested,
   handling errors, documented. Prototypes live on branches and die there.
3. **Decisions are recorded.** Any choice that a future engineer would ask
   "why is it like this?" about gets an ADR in `docs/decisions/`
   (see `docs/templates/adr-template.md`) and a line in `DECISIONS.md`.
4. **Documentation moves with code.** A PR that changes behavior updates the
   affected docs in the same PR. Outdated documentation is treated as a bug.

## Workflow

1. Pick a task from `docs/tasks/BACKLOG.md` (or create one from the template).
2. Branch from `main`: `type/short-description` where type is
   `feat | fix | refactor | docs | chore | perf | test`.
3. Implement following `CODING_STANDARDS.md`, `TESTING.md`, `SECURITY.md`.
4. Ensure locally: build passes, lint passes, types pass, tests pass.
5. Open a PR using the checklist below. Small PRs (< ~400 lines of diff)
   review better; split large work.
6. Update `CHANGELOG.md` under `[Unreleased]`.

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/) v1.0.0:

```
feat(contacts): add duplicate detection on create
fix(auth): reject expired session tokens on websocket connect
docs(architecture): record queue technology decision
```

- Scope = module or system area.
- Breaking changes: `!` suffix and a `BREAKING CHANGE:` footer.
- Commits are atomic: one logical change, buildable on its own.

## Pull request checklist

- [ ] Task reference and one-paragraph intent
- [ ] Build, lint, typecheck, tests green
- [ ] New behavior covered by tests (see `TESTING.md` for required layers)
- [ ] Error, empty, and loading states handled (UI work)
- [ ] Accessibility pass done (UI work)
- [ ] Security review of inputs, authz, and tenant isolation (see `SECURITY.md`)
- [ ] Docs updated (list them in the PR description)
- [ ] `CHANGELOG.md` updated
- [ ] No new dependency without justification in the PR description
      (and an ADR if it is architecturally significant)

## Dependency policy

Every dependency is a liability with a maintenance tail. Before adding one:

- Prefer the platform (web standards, Node built-ins) over a package.
- Check: maintenance activity, download trend, license (MUST be
  MIT/Apache-2.0/BSD/ISC-compatible), install size, transitive dependencies.
- Pin via lockfile; upgrades are deliberate PRs, not side effects.

## Code review standards

Reviewers verify, in order: correctness → security/tenancy → architecture fit
→ tests → readability → performance. Style nits belong to the formatter, not
the reviewer. "Looks good" without having run or reasoned through the change
is not a review.
