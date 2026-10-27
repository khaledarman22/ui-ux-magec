---
name: workspace-access
description: Read and write project files in the .ui-ux-magec workspace safely, in the right area, without touching service-owned state.
category: shared
agents: []
tools: [magec_artifact_read, magec_artifact_write, magec_asset_list, magec_project_status]
related: [context-management, structured-output, checkpoint-management]
---

# Workspace access

## Purpose
The workspace is the project's source of truth. It lives in the user's project folder under `.ui-ux-magec/`
and is managed by runtime services. This skill defines where artifacts belong, which areas agents may write,
and which files are owned by the runtime and must only change through tools.

## When to use
- Whenever you read an input artifact or save a supporting artifact (notes, drafts, specs).
- When you need user-supplied assets (logos, images, icons).
- When unsure where a file belongs.

## Inputs
- Workspace-relative paths (e.g. `planning/product-analysis.json`), never absolute paths into `.ui-ux-magec/`.
- Layout: `planning/`, `tasks/`, `research/`, `references/`, `concepts/`, `design-system/`, `figma/`, `memory/`,
  `cache/`, `checkpoints/`, `feedback/`, `reports/`, `logs/`, `locks/`, plus `project.json`, `state.json`,
  `manifest.json` at the root. User assets live outside it in `assets/logos`, `assets/images`, `assets/icons`.

## Outputs
- Supporting artifacts written with `magec_artifact_write`, registered in `manifest.json` with your agent id
  and task id.

## Tool requirements
- `magec_artifact_read` — read any artifact by workspace-relative path.
- `magec_artifact_write` — write supporting artifacts in writable areas only.
- `magec_asset_list` — list user assets with absolute paths for visual inspection.
- `magec_project_status` — quick check that a project exists and what stage it is in.

## Instructions
1. Read with workspace-relative paths. Paths from `magec_project_context` and task `inputRefs` are already in
   that form.
2. Write supporting material only to the writable areas: `planning`, `research`, `references`, `concepts`,
   `design-system`, `figma`, `reports`, `feedback`, `memory`.
3. Pass `taskId` and an accurate `kind` when writing, so the manifest records provenance.
4. Name files with lowercase kebab-case and a scope suffix, e.g. `research/notes-hero-section.json`,
   `figma/specs/home.json` (specs go through `magec_design_spec_save`, not raw writes).
5. Deliver the task's primary output only through `magec_task_complete`; the runtime writes it to the
   contract's `artifactPath`.
6. To inspect user images, call `magec_asset_list` and open the returned absolute path with your host's file
   or image reader. Do not copy assets into the workspace.
7. Prefer updating your own previous supporting artifact over creating near-duplicates.

## Constraints
- Never edit `project.json`, `state.json`, `manifest.json`, `tasks/tasks.json`, `checkpoints/`, `locks/` or
  `logs/` directly, with host file tools or otherwise. They are service-owned.
- Never write task outputs with `magec_artifact_write` (it bypasses validation and claim checks).
- `cache/` is disposable: never store anything there you need later, and never treat it as memory.
- Never delete workspace files. Archiving on reset is a user-initiated runtime operation, not an agent action.
- Never write outside the project folder or into another project's workspace.

## Validation
- Every path you write starts with one of the writable areas.
- The artifact can be read back with `magec_artifact_read` and appears in the context pack's artifact list.
- No service-owned file changed as a result of your task.

## Error handling
- Write refused for an area: you chose the wrong place; move it to a writable area or return it as task output.
- Read of a missing path: confirm the producer task completed; do not recreate someone else's artifact from
  memory.
- Invalid JSON in an artifact you depend on: report it (kind `validation`) instead of silently repairing it;
  the workspace-manager owns repair.

## Related
- `structured-output` — how primary outputs are delivered.
- `checkpoint-management` — what is captured in checkpoints.
- `context-management` — what to read first.
