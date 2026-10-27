---
name: progress-reporting
description: Report task and project progress accurately from task state, with real evidence and no inflated claims.
category: shared
agents: []
tools: [magec_project_status, magec_task_list, magec_task_get, magec_message_send]
related: [structured-output, task-communication, quality-standards]
---

# Progress reporting

## Purpose
Users and the orchestrator see progress through task states, stage markers and short reports, not through an
agent's narration. This skill keeps progress statements derived from those facts so nobody is told that work
is done when it is not.

## When to use
- When completing a task (the `notes` field and limitation fields).
- When the master-orchestrator reports status to the user.
- When a long task needs to tell the next agent what remains.

## Inputs
- `magec_project_status`: project status, completed stages, task counts, next ready tasks, approvals waiting,
  failures.
- `magec_task_list` filtered by `status` or `agent`.
- Task states: `pending`, `ready`, `running`, `blocked`, `waiting_for_approval`, `completed`, `failed`,
  `cancelled`, `superseded`.

## Outputs
- Short status statements grounded in task ids, stage names and artifact paths.

## Tool requirements
- `magec_project_status` — the overview.
- `magec_task_list` / `magec_task_get` — detail per task.
- `magec_message_send` — `result` or `note` messages when an output needs context.

## Instructions
1. Derive progress from state, not from intent: "completed" means the task status is `completed` and its
   output was accepted.
2. Report with this shape: done (stages/tasks), in progress (`running`), waiting on the user
   (`waiting_for_approval`, with the question), blocked or failed (with the last error), next (ready tasks).
3. Name concrete evidence: artifact paths (`reports/qa-home-1a2b3c.json`), Figma page names, preview paths.
4. Distinguish `cancelled` (user declined or no longer needed) and `superseded` (replaced by newer work) from
   `failed`.
5. In task `notes`, mention only what the contract cannot carry: partial coverage, placeholders used,
   deferred items.
6. Report counts precisely ("3 of 5 pages designed; QA passed on 2, 1 in fix iteration 2").
7. Speak the user's language: reply in Arabic when the user writes in Arabic.

## Constraints
- Never say "done", "verified", "tested" or "passed" without the corresponding completed task or check result.
- QA checks that did not run are "skipped", never "passed".
- Do not report percentages you cannot compute from task counts.
- Do not hide failures or pending approvals to make progress look smoother.
- Keep updates brief; link to artifacts rather than pasting them.

## Validation
- Every claim maps to a task id, stage name or artifact path.
- Waiting approvals are listed with what the user needs to decide.
- Failed tasks include their last error message.

## Error handling
- Status and artifacts disagree (task completed but artifact missing): report the inconsistency and ask the
  workspace-manager to validate the workspace.
- Status unavailable: say so; do not reconstruct progress from memory.

## Related
- `structured-output` — notes and limitation fields.
- `task-communication` — messages to other agents.
- `quality-standards` — what qualifies as done.
