---
name: workspace-management
description: Keep the .ui-ux-magec workspace healthy — correct areas, checkpoints at meaningful stages, Figma snapshots — without ever deleting project data or bypassing the services that own state.
category: specialized
agents: [workspace-manager]
tools: [magec_task_start, magec_task_complete, magec_task_fail, magec_project_status, magec_project_context, magec_artifact_read, magec_artifact_write, magec_checkpoint_create, magec_figma_status, magec_figma_snapshot, magec_message_send, magec_figma_read]
related: [project-continuity, project-state-validation, memory-management, cache-management]
---

# Workspace management

## Purpose
The workspace (`.ui-ux-magec/` in the project folder) is the project's persistent state. The deterministic
workspace service (`packages/workspace/src/workspace.ts`) owns integrity: atomic writes, locks, manifest
hashes, schema validation. This skill keeps the workspace orderly through the tools, handles `figma-snapshot`
and `checkpoint` work, and protects data from loss.

## When to use
- Tasks of type `figma-snapshot` or `checkpoint` assigned to workspace-manager (normally run deterministically by the runtime; you handle them when dispatched to you or when their output needs interpretation).
- When another agent asks where something lives or why a write was rejected.

## Inputs
- `magec_project_status` (phase, completed stages, tasks, failures) and `magec_project_context`.
- Workspace layout: `planning/`, `research/`, `references/`, `concepts/`, `design-system/`, `figma/`
  (`mappings.json`, `operations.jsonl`, `specs/`, `reports/`, `snapshot.json`, `reconcile.json`), `memory/`,
  `feedback/`, `reports/` (`previews/`), `tasks/`, `checkpoints/`, `cache/`, `logs/`, `locks/`; assets in `<project>/assets/{logos,images,icons}`.

## Outputs
- `figma/snapshot.json` (via `magec_figma_snapshot`), checkpoints (via `magec_checkpoint_create`), short notes in `reports/` when useful.

## Tool requirements
- `magec_figma_snapshot` — reads pages, frames, components, styles, variables; saves `figma/snapshot.json` and the `figma-metadata` cache.
- `magec_checkpoint_create { stage, label }` — copies persistent state (`project.json`, `state.json`, `manifest.json`, `tasks/tasks.json`, `planning`, `concepts`, `design-system`, `figma/mappings.json`, `memory`, `feedback`, `references/references.json`).
- `magec_artifact_write` — only into writable areas: `planning`, `research`, `references`, `concepts`, `design-system`, `figma`, `reports`, `feedback`, `memory`.

## Instructions
1. Start the task; read status and context.
2. Snapshot: `magec_figma_status` (connected, file matches), then `magec_figma_snapshot`; summarize page/frame/component/style/variable counts in the task output or notes.
3. Checkpoint after meaningful stages (brand, design system, page designed, QA passed) with a stage name and human label. Stage completions already trigger automatic checkpoints; do not duplicate them.
4. Keep each artifact in its area; task outputs go through `magec_task_complete`, not `magec_artifact_write`.
5. Never touch service-owned files (`project.json`, `state.json`, `manifest.json`, `tasks/`, `locks/`); the tools reject such writes.
6. When a scope must be reset, ask the orchestrator; the service archives artifacts inside the workspace (`archive/<stamp>/`) rather than deleting them.
7. Report anomalies (missing files, hash mismatches) via `project-state-validation`.

## Constraints
- Never delete project data, assets, checkpoints or memory. Archiving is the only removal path, and only by the service on user request.
- Never initialize a workspace (`magec_project_init` is not yours) and never resurrect a deleted project.
- Cache is not state: do not store anything authoritative under `cache/`.

## Validation
- Snapshot saved and its summary matches `magec_figma_read` counts when spot-checked.
- Checkpoint returns an id and lists the files it captured.

## Error handling
- Figma not connected or file mismatch: `magec_task_fail` kind `external`, quoting the bridge detail; do not snapshot another file.
- Lock held (`locked`): retry once later; persistent locks go to `project-state-validation`.
- Write rejected for area: choose the right area; never work around it.

## Related
- `project-continuity`, `project-state-validation`, `memory-management`, `cache-management`.
