---
name: retry-management
description: Distinguish retry, redesign, reset and delete, and retry only technical failures within the attempt limit without changing the approach blindly.
category: shared
agents: []
tools: [magec_task_get, magec_task_list, magec_task_fail, magec_feedback_submit]
related: [error-handling, user-feedback-processing, checkpoint-management]
---

# Retry management

## Purpose
"Try again" can mean four very different operations. Mixing them up either loses user work or repeats a
rejected design. This skill defines each operation, who may trigger it, and how to behave on a retried task.

## When to use
- You start a task whose `attempt` is greater than 1.
- A user or agent asks to "redo", "retry", "start over", "reset" or "delete" something.
- You are deciding whether a failed task should be retried.

## Inputs
- Task details from `magec_task_get`: `attempt`, `maxAttempts` (default 3), `errors`, `status`.
- The user's wording, when the request comes from feedback.

## Outputs
- A correctly chosen operation: an attempt that avoids the previous error, a feedback submission, or a
  user-facing explanation of reset/delete.

## Tool requirements
- `magec_task_get` / `magec_task_list` — attempt history and related tasks.
- `magec_task_fail` — report a failure with the correct `retryable` flag.
- `magec_feedback_submit` — orchestrator only; turns creative requests into scoped work.

## Instructions
1. Know the four operations:
   - **Retry** — the same task, same inputs, after a technical/external failure. The runtime re-queues
     retryable failures until `maxAttempts`. Goal: the same result, now succeeding.
   - **Redesign** — a creative change after the user rejected a result. It is feedback, not failure: new
     research/concept/design tasks are created, old open work is `superseded`, and the rejected direction is
     recorded so it is not repeated.
   - **Reset** — the user explicitly clears a scope; its artifacts are archived inside the workspace and the
     scope is replanned. Agents never reset on their own.
   - **Delete** — the user permanently removes a project. Deleted projects are never resurrected: never
     recreate one from memory, cache, checkpoints or global knowledge. `magec_project_init` always creates a
     new project id.
2. On a retried task, read the previous `errors` first and change what caused them (smaller batch, re-read
   input, reconnect check). Do not repeat an identical attempt.
3. Keep retries idempotent: Figma writes upsert by logical id, research skips queries already run, specs
   overwrite by name. Do not create duplicates on retry.
4. If the same error appears twice, stop retrying: fail with `retryable: false` and a clear explanation.
5. When a user says "try again" about a design they disliked, treat it as redesign feedback, not as a retry.

## Constraints
- Never retry a creative rejection. Never mark it failed.
- Never retry destructive operations (node deletion, overwrite of user edits) without a fresh approval.
- Never exceed `maxAttempts` by creating a duplicate task for the same idempotency key.
- Never resurrect deleted projects, nodes or archived artifacts unless the user explicitly asks to restore
  them from a checkpoint.

## Validation
- A retried attempt differs from the failed one in the part that failed.
- No duplicate nodes, references or tasks were created across attempts.
- Rejected directions remain rejected after a redesign.

## Error handling
- Task already `superseded` or `cancelled` when you try to work on it: stop; the graph moved on.
- Attempt limit reached: the task stays `failed`; the orchestrator reports it to the user with the last error
  and options (fix input, reconnect Figma, skip).
- Ambiguous "start over": ask (via the orchestrator) whether the user means a new concept, a reset of a scope,
  or a new project.

## Related
- `error-handling` — failure kinds and `retryable`.
- `user-feedback-processing` — redesign and new-concept flows.
- `checkpoint-management` — restoring versus resetting.
