---
name: memory-management
description: Keep project memory (decisions, assumptions, feedback) accurate, searchable and non-contradictory, and serve relevant context to other agents.
category: specialized
agents: [workspace-manager]
tools: [magec_memory_search, magec_decision_record, magec_assumption_record, magec_project_context, magec_artifact_read, magec_message_send]
related: [project-continuity, cache-management, workspace-management, project-state-validation]
---

# Memory management

## Purpose
Memory (`memory/decisions.jsonl`, `memory/assumptions.jsonl`, recorded feedback) is the project's authoritative
record of why things are the way they are. Agents consult it before acting so they do not contradict accepted
decisions or revive rejected directions. This skill keeps it clean and makes it easy to use.

## When to use
- When an agent or the orchestrator asks for context on a topic ("what did we decide about the hero?").
- When decisions supersede each other or assumptions get answered.
- During continuity checks at session start.

## Inputs
- `magec_memory_search { query, kinds: ["decision","assumption","feedback"], limit }`.
- `magec_project_context` (decisions, rejected directions, assumptions, feedback summarized).

## Outputs
- Superseding decisions (`magec_decision_record` with `supersedes`), new assumptions, and concise context
  messages to agents (`magec_message_send`, kind `answer` or `note`).

## Tool requirements
- `magec_decision_record` — `topic`, `decision`, `rationale`, `status` (`proposed` | `accepted` | `rejected`), `scope` (`project`, `page:<slug>`, `section:<id>`), `referenceIds`, `tags`, `supersedes`.
- `magec_assumption_record` — `statement`, `reason`, `impact`.

## Instructions
1. Search before writing: avoid duplicate decisions on the same topic and scope.
2. When a newer decision replaces an older one, record it with `supersedes: "<old decisionId>"`; never edit or remove history.
3. Record status faithfully: agent suggestions are `proposed`; only record `accepted`/`rejected` when the user's answer is documented (approval or feedback). Quote the source in `rationale`.
4. Scope precisely: a hero decision is `section:hero` or `page:home`, not `project`.
5. Assumptions: record why they were needed and their impact; when the user answers, record the resulting decision referencing the assumption.
6. Serving context: answer with the few relevant entries (topic, decision, status, scope, id), plus rejected directions in that scope.
7. Flag contradictions (two accepted decisions conflicting) to `master-orchestrator`; do not pick a winner.

## Constraints
- Memory is authoritative; cache is not. Never copy cached data (research results, snapshots) into memory as facts, and never store decisions in cache.
- Never delete or rewrite memory entries; append only.
- Do not invent user approvals.

## Validation
- Every superseded decision is referenced by exactly one newer decision.
- Accepted/rejected entries cite the user's words or approval task.
- Context answers include decision ids so agents can cite them.
- Rejected directions in scope are always mentioned when serving context for that scope.

## Error handling
- Search returns nothing for a topic that clearly had decisions: check `magec_project_context`; if still absent, report possible memory loss to `project-state-validation` rather than reconstructing entries.
- Conflicting user feedback over time: the latest explicit user statement wins; record it superseding the older one.

## Related
- `cache-management` — the non-authoritative counterpart.
- `project-continuity` — uses memory to resume.
