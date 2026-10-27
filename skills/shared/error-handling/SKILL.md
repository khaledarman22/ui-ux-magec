---
name: error-handling
description: Classify failures correctly, report them honestly with magec_task_fail, and never confuse creative rejection with failure.
category: shared
agents: []
tools: [magec_task_fail, magec_task_get, magec_figma_status, magec_figma_reconcile]
related: [retry-management, structured-output, user-feedback-processing]
---

# Error handling

## Purpose
Failures drive retries, user prompts and recovery. A wrongly classified failure wastes attempts or hides a
problem that needs a human. This skill defines how to recognise, classify and report failures, and what is
not a failure at all.

## When to use
- Any tool call returns an error you cannot fix within the task.
- `magec_task_complete` keeps rejecting your output.
- The task cannot be done as specified (missing input, missing permission, external service down).

## Inputs
- The error message and the tool that produced it.
- The task's attempt history (`magec_task_get`: `attempt`, `maxAttempts`, `errors`).

## Outputs
- One `magec_task_fail` call with `message`, `kind` and `retryable`, or a fixed and completed task.

## Tool requirements
- `magec_task_fail` — report the failure.
- `magec_task_get` — see earlier attempts and errors.
- `magec_figma_status` / `magec_figma_reconcile` — diagnose Figma connection or state problems
  (read-only; reconcile settles interrupted operations).

## Instructions
1. Try to fix locally first: wrong input fields, a missing read, an output schema error. Retry the step once.
2. If it still fails, classify the failure:
   - `technical` — transient runtime/tool problems (timeouts, bridge dropped, lock contention). Retryable.
   - `external` — a dependency outside the system (search provider down, Figma plugin not running, site
     unreachable). Usually retryable.
   - `validation` — your output or an input artifact is invalid and you could not correct it. Retryable only
     if a different attempt could succeed.
   - `permission` — the task needs a permission your agent lacks. Not retryable.
   - `conflict` — state conflict, e.g. Figma nodes edited by the user, task superseded. Not retryable without
     user action.
   - `unknown` — only when none of the above fits.
3. Write a `message` that states what failed, where (tool, path, logical id) and what would fix it.
4. Set `retryable: false` when repeating the same attempt cannot succeed (permissions, conflicts, missing
   user input).
5. For Figma errors, call `magec_figma_status`. If the bridge is down, fail `external`. If writes were
   interrupted, mention it; reconciliation settles the journal on resume.
6. Report partial success through `magec_task_complete` with `warnings`/`limitations` when the core output is
   valid; fail only when the contract cannot be met honestly.

## Constraints
- A creative rejection ("I don't like this", "make it more premium") is NOT a failure. Never call
  `magec_task_fail` for it; it is feedback and is routed via `magec_feedback_submit` by the orchestrator.
- Never hide a failure by fabricating output (invented references, nodes, previews or passed checks).
- Never retry destructive operations blindly.
- Do not loop: two local fixes per problem, then report.

## Validation
- The failure kind matches the cause; `retryable` reflects whether another attempt could succeed.
- The message names the tool and the artifact/node involved.
- No partial work is claimed that the journal or workspace does not show.

## Error handling
- `magec_task_fail` itself errors because the task is no longer running (superseded or cancelled): stop work
  on it; do not restart it.
- Unsure between `technical` and `validation`: if the same input would fail again, it is `validation`.

## Related
- `retry-management` — what happens after a failure.
- `user-feedback-processing` — handling rejections as feedback.
- `structured-output` — fixing contract errors before failing.
