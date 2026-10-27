---
name: project-state-validation
description: Detect inconsistencies between workspace files, task graph, memory and Figma mappings, and drive safe, non-destructive recovery.
category: specialized
agents: [workspace-manager]
tools: [magec_project_status, magec_project_context, magec_artifact_read, magec_task_list, magec_task_get, magec_figma_status, magec_figma_reconcile, magec_memory_search, magec_checkpoint_create, magec_message_send, magec_artifact_write]
related: [workspace-management, project-continuity, memory-management, cache-management]
---

# Project state validation

## Purpose
State can drift: a crashed process leaves a stale lock or temp file, a user edits an artifact by hand, a task
stays `running` forever, Figma mappings point at deleted nodes. This skill finds such inconsistencies, classifies
them, and recommends recovery that never loses or fabricates data.

## When to use
- At session start (after `project-continuity`), after failures, before final reporting.
- When an agent reports unexplained tool errors (locks, missing artifacts, schema failures).

## Inputs
- `magec_project_status`, `magec_task_list` (statuses, attempts), `magec_task_get` for suspicious tasks.
- Artifacts via `magec_artifact_read`: outputs referenced by completed tasks, `figma/mappings.json`, `figma/reconcile.json`.
- Workspace service validation results (manifest hash mismatches, missing files, stale locks, interrupted `.tmp` files, project id mismatches), when the runtime/CLI provides them.

## Outputs
- A findings message to `master-orchestrator` (`magec_message_send`, kind `result`) with each issue, severity and proposed action; optional `reports/state-validation.json` written with `magec_artifact_write`.

## Tool requirements
- `magec_figma_reconcile` — mapping vs live file consistency.
- `magec_checkpoint_create` — before any recovery action the orchestrator takes, so it can be undone.
- Service-level `validate()`/`repair()` are not MCP tools; recommend them (repair only recreates directories, clears stale locks, removes stale temp files).

## Instructions
1. Task graph: tasks `running` with no active agent, tasks `failed` at max attempts, dependencies on missing tasks, approvals waiting on the user. Recommend retry, re-plan or user prompt.
2. Artifacts: completed tasks whose output file is missing; artifacts modified outside the runtime (hash mismatch) — report, do not overwrite; the user's hand edit may be intentional.
3. Identity: `manifest.json`/`state.json`/checkpoints belonging to a different `projectId` are errors; never merge them in.
4. Figma: reconcile; `missing` nodes stay deleted; `changed-externally` nodes need approval before overwrite; journal entries left `pending` get settled by reconcile.
5. Memory: accepted decisions contradicted by later artifacts (e.g. design system uses a rejected color) — report to the orchestrator.
6. Classify severity: `critical` (identity mismatch, corrupt project.json), `major` (missing outputs, stuck tasks), `minor` (stale locks, temp files, cache issues).
7. Recommend the least destructive fix; create a checkpoint before recovery when state will change.

## Constraints
- Never delete project data, checkpoints, memory or assets; never restore a deleted project or import another project's files.
- Never "fix" by editing service-owned files (`project.json`, `state.json`, `manifest.json`, `tasks/`).
- Recovery from a checkpoint is the orchestrator's/user's decision; you recommend the latest valid checkpoint of this project only.

## Validation
- Each finding names the file/task/node and the evidence (status, hash mismatch, reconcile entry).
- Recommendations are reversible or explicitly approved.
- Nothing is reported as fixed unless a tool result confirms it.
- Cache problems are reported as `minor` and never block work; the cache is recomputable.

## Error handling
- `project.json` unreadable (workspace corrupt): stop and report; do not initialize a new workspace over it.
- Tool errors during validation: report partial findings with what could not be checked.
- Stuck `running` task owned by another agent: report it; do not complete or fail tasks you do not own.

## Related
- `project-continuity`, `workspace-management`, `memory-management`, `cache-management`.
