---
name: dependency-management
description: Build and respect dependency-aware task graphs with idempotency keys, scopes and locks so work runs in the right order without duplicates or conflicting writes.
category: shared
agents: []
tools: [magec_task_list, magec_task_get, magec_task_next, magec_task_create]
related: [task-communication, retry-management, progress-reporting]
---

# Dependency management

## Purpose
Work in ui-ux-magec is a task graph: a task becomes `ready` only when its dependencies are `completed`.
Idempotency keys stop planning twice from duplicating work, and scopes (e.g. `figma:page:home`) keep two
writers away from the same Figma area. This skill keeps the graph correct.

## When to use
- Creating ad-hoc tasks (master-orchestrator).
- Starting a task and checking that its inputs really exist.
- Investigating `blocked` tasks or a graph that stopped progressing.

## Inputs
- The task graph via `magec_task_list` / `magec_task_get` (`dependencies`, `status`, `scope`, `idempotencyKey`,
  `workflowId`, `supersededBy`).
- Standard pipeline: product-analysis → brand-analysis and research-plan → research/visual-analysis per
  category → concept-generation → (concept-approval when selection is `user`) → design-system →
  figma-foundations → figma-page-design per page → design-qa → (figma-fix → design-qa)* → project-summary.

## Outputs
- New tasks with correct `dependencies` (task ids or idempotency keys), `idempotencyKey`, `scope`, `params`.

## Tool requirements
- `magec_task_list`, `magec_task_get`, `magec_task_next` — inspect the graph and what is ready.
- `magec_task_create` — orchestrator only; at most 50 tasks per call.

## Instructions
1. Give every new task a stable `idempotencyKey` of the form `<workflowId>:<step>[:<scope>]`
   (e.g. `feedback-ab12:fix:home`). Re-creating with the same key returns the existing task.
2. Declare only real data dependencies: a task depends on the tasks whose artifacts it reads.
3. Set `scope` on every Figma-writing task (`figma:foundations`, `figma:page:<slug>`). Tasks sharing a scope
   never run concurrently.
4. Keep the summary last: `project-summary` depends on the final QA tasks of each page.
5. Assign each task to the agent whose `taskTypes` include its type (`magec_agent_list`).
6. Use `parentTaskId` for follow-ups (fixes, retries) so history stays traceable.
7. Before starting work, confirm the dependency outputs exist; if one is missing, fail with kind `validation`.
8. When work is replaced (redesign, new concept), the runtime marks open tasks `superseded`; do not create
   parallel duplicates of superseded work.

## Constraints
- No cycles. No dependency on a `cancelled`, `failed` or `superseded` task unless you intend to block.
- Approval tasks (`approval`, `concept-approval`) are never dispatched to agents; they move to
  `waiting_for_approval` and wait for the user.
- Do not bypass dependencies by starting a task that is not `ready`.
- Deterministic tasks (`figma-snapshot`, `figma-reconcile`, `checkpoint`) run through
  `magec_task_run_deterministic`, not through an agent.

## Validation
- `magec_task_next` returns the expected next tasks after creation.
- No two ready tasks share a Figma scope.
- Every idempotency key is unique per unit of work.

## Error handling
- Task stuck in `blocked`/`pending`: inspect its dependencies; a failed upstream task must be fixed, retried
  or replaced first.
- Duplicate work detected: keep the task linked to the latest accepted decision; let the other be superseded.
- Lock contention on a scope: wait for the running task; never force a parallel write.

## Related
- `retry-management` — superseding and retrying.
- `progress-reporting` — explaining blocked work.
- `task-communication` — asking for missing inputs.
