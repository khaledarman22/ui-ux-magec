---
name: checkpoint-management
description: Create checkpoints of persistent project state at meaningful stages and use them safely for recovery.
category: shared
agents: []
tools: [magec_checkpoint_create, magec_project_status, magec_task_run_deterministic, magec_task_list]
related: [workspace-access, retry-management, figma-context-reading]
---

# Checkpoint management

## Purpose
Checkpoints are snapshots of persistent project state taken after meaningful stages, so a project can resume
or be inspected at a known-good point. They complement, but do not replace, the live workspace.

## When to use
- After a stage that the runtime does not checkpoint automatically, or before a risky multi-step change.
- When running a `checkpoint` task (deterministic, handled by the runtime).
- When the user asks where a project can be restored to.

## Inputs
- Stage names already recorded by the orchestrator: `requirements-completed`, `research-completed`,
  `concept-selected`, `design-system-created`, `figma-foundations-created`, `page-designed:<slug>`,
  `qa-completed:<slug>`. These are checkpointed automatically when reached.
- Checkpointed paths: `project.json`, `state.json`, `manifest.json`, `tasks/tasks.json`, `planning/`,
  `concepts/`, `design-system/`, `figma/mappings.json`, `memory/`, `feedback/`, `references/references.json`.

## Outputs
- A checkpoint under `checkpoints/<id>` with a stage, label and task status snapshot.

## Tool requirements
- `magec_checkpoint_create` — `stage` and `label`.
- `magec_project_status` — completed stages (avoid duplicates).
- `magec_task_run_deterministic` — orchestrator runs `checkpoint` tasks this way.
- `magec_task_list` — confirm no task is mid-write before checkpointing.

## Instructions
1. Check `magec_project_status`; if the stage is already completed, do not create another checkpoint for it.
2. Checkpoint only at consistent moments: no Figma write task in `running` for the affected scope, and the
   stage's outputs accepted.
3. Use a stable `stage` (kebab-case, scoped like `page-designed:home`) and a human-readable `label`.
4. Create an extra checkpoint before risky operations the user approved (bulk overwrite, removal), labelled
   with the approval task id.
5. For `checkpoint` tasks in the graph, the orchestrator calls `magec_task_run_deterministic`; agents do not
   claim them.
6. On resume, the runtime validates the workspace and reports the latest valid checkpoint; use it to explain
   to the user what is safely persisted.

## Constraints
- Checkpoints capture workspace state, not the Figma file. Figma state is tracked by `figma/mappings.json`
  and reconciled against the live file; restoring a checkpoint never recreates deleted Figma designs.
- `cache/`, `logs/`, `locks/` and previews are not checkpointed; never rely on them for recovery.
- Restoring from a checkpoint is a user decision. Never restore on your own, and never use a checkpoint to
  resurrect a deleted project.
- Do not create checkpoints in a loop or per small edit.

## Validation
- The new checkpoint appears in project status and is associated with the right stage.
- The task snapshot shows no `running` tasks in the affected scope.

## Error handling
- Checkpoint creation fails (disk, lock): fail with kind `technical`; state is still intact in the workspace.
- Latest checkpoint is invalid on resume: report it; the runtime falls back to the previous valid one.
- Workspace validation errors: hand off to the workspace-manager; do not hand-edit state files.

## Related
- `workspace-access` — state files that only services change.
- `retry-management` — reset and delete versus restore.
- `figma-context-reading` — reconciliation of Figma state.
