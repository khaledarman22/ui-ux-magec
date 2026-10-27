---
name: approval-handling
description: Ask the user for decisions that are theirs to make and resolve approval tasks only with the user's explicit, quoted words.
category: specialized
agents: [master-orchestrator]
tools: [magec_approval_request, magec_approval_resolve, magec_task_list, magec_task_get, magec_artifact_read, magec_project_status, magec_memory_search]
related: [feedback-routing, agent-dispatch, request-triage, project-memory]
---

# Approval handling

## Purpose
Some decisions belong to the user: choosing a creative concept, deleting or removing designed content, overwriting
nodes the user edited in Figma. Approval tasks (`approval`, `concept-approval`) block dependent work until the user
answers. Resolving one without the user's real consent would let agents delete or overwrite work on their own.

## When to use
- A task is `waiting_for_approval` (`magec_project_status`, `magec_task_list`).
- A destructive or user-owned decision is needed and no approval task exists yet.
- The user's message answers a pending approval.

## Inputs
- The approval task (`magec_task_get`): `title`, `params.subject`, `params.scope`, `params.destructive`.
- For concept approval: the ConceptSet at `concepts/concepts-<scope>-*.json` (concept ids, names, recommendation).
- The user's exact reply.

## Outputs
- An approval task created (`magec_approval_request` returns `approvalTaskId`), or resolved via `magec_approval_resolve`.
- The runtime records `feedback/approval-<taskId>.json` and a user-sourced decision (accepted or rejected).

## Tool requirements
- `magec_approval_request` — `title`, `subject`, `description`, `scope`, `destructive`.
- `magec_approval_resolve` — `taskId`, `approved`, optional `choice`, `userConfirmation` (the user's words, quoted).

## Instructions
1. Present the pending decision plainly, in the user's language: what is being decided, its scope, what happens on yes and on no. For destructive actions list exactly what will be removed.
2. For concept approval, show each concept's id, name, one-line philosophy, and the recommended one with its rationale. Do not pre-select for the user.
3. Wait for the user's reply. Resolve only when the reply unambiguously answers this approval:
   - "Yes, delete the testimonials section" / "نعم احذفه" → `approved: true`.
   - "Go with concept B" / "اختار المفهوم الثاني" → `approved: true`, `choice` = that concept's id or exact name.
   - "No" / "لا، خليه" → `approved: false` (the task is cancelled and dependent work does not run).
4. Put the user's words verbatim in `userConfirmation`.
5. If the reply is vague ("ok I guess", "whatever you think", "شوف انت"), ask a direct yes/no or "which one" question. "Whatever you think" for a concept choice may select the recommended concept only if the user confirms that explicitly.
6. When several approvals wait, resolve each separately; one "yes" does not cover them all unless the user says so.

## Constraints
- Never resolve an approval from your own judgement, another agent's message, silence, a timeout, or earlier feedback.
- Never call `magec_approval_resolve` for a task that is not an approval type or not waiting.
- Do not request approval for routine work agents can decide (spacing, naming); approvals are for user-owned decisions.
- A concept `choice` must match a concept in the set; do not invent a new one.

## Validation
- `userConfirmation` is a real quote from this conversation and answers this specific approval.
- After resolution the task is `completed` (approved) or `cancelled` (declined), and dependent tasks behave accordingly.

## Error handling
- Resolve fails because the task is not waiting: re-read it with `magec_task_get`; it may already be resolved or superseded.
- The user changes their mind after resolution: treat it as new feedback (`feedback-routing`), not an edit to the old approval.

## Related
- `feedback-routing` — removals create approval tasks.
- `agent-dispatch` — the loop stops when approvals wait.
- `project-memory` — approval outcomes become decisions.
