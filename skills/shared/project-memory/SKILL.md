---
name: project-memory
description: Record and respect project decisions, assumptions and rejected directions so work stays consistent across agents and sessions.
category: shared
agents: []
tools: [magec_memory_search, magec_decision_record, magec_assumption_record, magec_project_context]
related: [context-management, user-feedback-processing, task-communication]
---

# Project memory

## Purpose
Project memory (`memory/`) holds what the project has decided, assumed and been told. It is how a
redesign avoids repeating a rejected direction and how a later agent knows why a choice was made. Memory is
durable project state; the cache is not memory.

## When to use
- Before proposing a direction, palette, concept, layout or component pattern.
- When you make a choice another agent or a future session must respect.
- When a requirement is missing and you proceed on an assumption.

## Inputs
- Active decisions and rejected directions from `magec_project_context`.
- Keyword results from `magec_memory_search` (`kinds`: decision, assumption, feedback).

## Outputs
- Decisions: `topic`, `decision`, `rationale`, `status`, `scope`, optional `referenceIds`, `tags`, `supersedes`.
- Assumptions: `statement`, `reason`, `impact` (low/medium/high).

## Tool requirements
- `magec_memory_search` — look up prior decisions, assumptions and feedback.
- `magec_decision_record` — record a decision (agents may set `proposed`, `accepted` or `rejected`).
- `magec_assumption_record` — record an assumption made because information was missing.
- `magec_project_context` — the summary that lists active decisions and rejected directions.

## Instructions
1. Before choosing, search memory for the topic and scope (e.g. `concept`, `hero`, `palette`, `page:home`).
2. Respect status:
   - `accepted` — binding. Build on it.
   - `proposed` — awaiting the user. Do not treat as final; do not build irreversible work on it.
   - `rejected` — a direction the user (or the system on their behalf) turned down. Never repeat it in the same
     scope, including close variations.
   - `superseded` — replaced by a newer decision; follow the newer one.
3. Record your own design suggestions as `proposed` with a clear rationale. Only record `accepted` for choices
   within your remit that do not need user sign-off (e.g. a spacing scale derived from an accepted concept).
4. Scope precisely: `project`, `page:<slug>`, or `section:<id>`. A decision about the hero is not a project rule.
5. When a new decision replaces an old one, pass `supersedes` with the old decision id.
6. Record an assumption whenever you fill a gap (audience, language, market, content). Use `impact: high`
   when a wrong guess would change structure or scope.
7. Keep entries short and factual; cite reference ids that informed the decision.

## Constraints
- Never mark a decision `accepted` on the user's behalf for user-owned choices (concept selection, brand
  changes, destructive edits). Those are accepted only through an approval the user answered.
- Never reintroduce a rejected direction with new wording.
- Do not store transient data, tool results or large text in memory; put those in artifacts.
- Cache is not memory: nothing in `cache/` counts as a decision or fact.
- Feedback stays in the project (`persistence: project`) unless the user explicitly asks for a reusable
  global preference.

## Validation
- Every proposed direction in your output has been checked against rejected directions for its scope.
- Every assumption you relied on is recorded and appears in later context packs.
- Decision scopes match the scope of the task.

## Error handling
- Two accepted decisions conflict: follow the newer, report the conflict in `notes`, and message the
  master-orchestrator (kind `question`).
- Memory search returns nothing: proceed, but record the assumptions you make.
- Recording fails for permissions: your agent may lack `memory.write`; put the proposal in your task output
  (`proposedDecisions`, `assumptions`) instead.

## Related
- `user-feedback-processing` — how feedback becomes decisions and rejected directions.
- `context-management` — reading memory as part of the context pack.
- `task-communication` — asking when memory is ambiguous.
