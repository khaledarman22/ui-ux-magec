---
name: agent-dispatch
description: Hand ready tasks to the right specialist with a complete brief, run deterministic tasks directly, and monitor results until the graph stops or needs the user.
category: specialized
agents: [master-orchestrator]
tools: [magec_task_next, magec_task_get, magec_task_list, magec_agent_list, magec_agent_brief, magec_task_run_deterministic, magec_message_send, magec_project_status, magec_skill_list]
related: [workflow-planning, approval-handling, retry-management, task-communication]
---

# Agent dispatch

## Purpose
Specialists only work on tasks they claim with `magec_task_start`. The orchestrator decides what is ready, who runs
it, and with which brief, then watches outcomes. Good dispatch keeps independent work parallel, keeps Figma writes
serialized per scope, and stops cleanly when the user must decide.

## When to use
- Right after planning, and after every task completes or fails.
- When resuming a session (`magec_project_status` shows ready tasks).

## Inputs
- `magec_task_next` (ready tasks; approval tasks are never returned).
- `magec_agent_brief` with `agentId` and `taskId` (instructions, skill index, task context).

## Outputs
- Tasks claimed and completed by specialists; progress messages to the user.

## Tool requirements
- `magec_task_next` — what can run now.
- `magec_agent_brief` — the brief to give a subagent (or to adopt yourself on hosts without subagents).
- `magec_task_run_deterministic` — tasks executed by runtime code (snapshots, reconcile, checkpoints).
- `magec_task_get` / `magec_task_list` — inspect outputs, errors and attempts.
- `magec_message_send` — revision requests or questions attached to a task.

## Instructions
1. Call `magec_task_next`. For each task, confirm the owner with `magec_agent_list` if unsure.
2. Deterministic tasks: run them with `magec_task_run_deterministic`; never ask an LLM agent to fake them.
3. LLM tasks: fetch `magec_agent_brief({ agentId, taskId })` and start a subagent with that brief verbatim. Tell it to call `magec_task_start` with the `taskId` first and `magec_task_complete` last. On hosts without subagents, switch roles using the same brief.
4. Run independent tasks in parallel (e.g. research per category). Never run two tasks with the same Figma `scope` at once.
5. After each completion, read the result with `magec_task_get` and call `magec_task_next` again; the runtime may have expanded the graph.
6. Stop the loop and inform the user when: an approval is waiting, a task failed after its retry limit, or nothing is ready.
7. Report progress in one or two lines per stage (what finished, what is next), in the user's language.

## Constraints
- Do not complete a specialist's task yourself with invented output; if you switch roles, do the real work under that role's brief and tools.
- Never dispatch an approval task; it waits for the user (`approval-handling`).
- Do not re-dispatch a running task; check status first.
- A creative rejection by the user is feedback, not a task failure.

## Validation
- Every dispatched task reached `completed`, `failed` with a reason, or is still `running` with a known owner.
- No two Figma writers ran concurrently on the same scope.

## Error handling
- Retryable failure (`technical`, `external`): the runtime retries up to the attempt limit; re-dispatch when it is ready again.
- `permission` failure: the wrong agent got the task; do not retry with the same agent.
- `validation` failure after corrections: read the errors, send a `revision-request` via `magec_message_send`, or surface to the user.
- Repeated failure: stop, report the cause and the options to the user.

## Related
- `workflow-planning` — produces the tasks dispatched here.
- `approval-handling` — what to do when the loop stops for approval.
- `retry-management`, `task-communication` — shared retry and messaging rules.
