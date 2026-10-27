---
name: figma-node-editing
description: Change existing Figma nodes safely — prefer spec re-apply, patch with magec_figma_update_nodes, respect user edits via fingerprints and approvals, and delete only owned nodes with approval.
category: specialized
agents: [figma-designer]
tools: [magec_task_start, magec_task_complete, magec_figma_status, magec_figma_reconcile, magec_figma_read, magec_figma_update_nodes, magec_figma_apply_spec, magec_figma_delete_nodes, magec_figma_accept_external_changes, magec_approval_request, magec_artifact_read, magec_message_send]
related: [figma-frame-creation, figma-layer-organization, design-validation, visual-qa]
---

# Figma node editing

## Purpose
Fixes and refinements touch nodes that may have been edited by a person in Figma. The bridge records a
fingerprint per node; writes over changed nodes are refused unless the user approved an overwrite. This skill
makes edits precise, keeps the spec as the source of truth, and never destroys user work.

## When to use
- `figma-fix` tasks (params `qaReport`, `issueIds`) and refinement tasks from feedback.
- Any time a write returns a `conflict`.

## Inputs
- The QA report or feedback task brief; `figma/specs/*.json`; `figma/mappings.json`.
- Current mapping state from `magec_figma_reconcile` (`ok`, `missing`, `changedExternally`).

## Outputs
- `FigmaWriteReport` with updated nodes and operation ids; unresolved items in `warnings` / `unsupported`.

## Tool requirements
- `magec_figma_reconcile` — before editing, to know which nodes changed or vanished.
- `magec_figma_apply_spec` — preferred for structural/style changes (edit the spec, re-apply; unchanged trees are skipped).
- `magec_figma_update_nodes` — small patches (`name`, `x`, `y`, `width`, `height`, `visible`, `opacity`, `fills`, `characters`, `cornerRadius`) by `logicalId`, max 100 per call.
- `magec_approval_request` — overwrite or delete permission; `magec_figma_delete_nodes` with `approvalTaskId`.

## Instructions
1. Start the task, check status, run reconcile.
2. For each issue, locate the node by `logicalId` in the report or mapping. Fix at the source: edit the spec and
   re-save it, then re-apply only the affected screen (`screens: ["home-mobile"]`). Use `update_nodes` for one-off
   text or size tweaks, then mirror the change in the spec so the next apply does not revert it.
3. `missing` nodes were deleted in Figma: do not recreate them unless the task explicitly asks for that design.
4. On `conflict` (or nodes listed `changedExternally`):
   - Do not retry. Either write the change to a new frame/screen beside the edited one, or
   - call `magec_approval_request` (`title`, `subject` naming the logicalIds, `description` of what would be lost, `scope: "figma:page:<page>"`, `destructive: true`), report the `approvalTaskId` to `master-orchestrator` via `magec_message_send`, complete the rest of the task, and list the blocked nodes in `warnings`.
   - Only after the user approved (approval task completed, approved) pass `overwriteAuthorization: "<approvalTaskId>"`.
5. If the user says their Figma edits should be kept, use `magec_figma_accept_external_changes` (with the approved approval id) and update the spec to match before any re-apply.
6. Deletion: only nodes this project created, only with an approved approval: `magec_figma_delete_nodes { taskId, logicalIds, approvalTaskId }`. `pruneOwnedChildren: true` on apply also removes owned children absent from the spec — use it only under the same approval.
7. Export previews of changed screens; complete with exact results.

## Constraints
- Never overwrite, delete or restyle user-made nodes without approval; never fabricate an approval id.
- Never "fix" by flattening, detaching instances or hiding problems (`visible: false` is not a fix for overflow).
- Keep edits within the task scope; unrelated sections stay untouched.

## Validation
- Every QA `issueId` in the task is fixed or listed with a reason.
- The spec and Figma agree after the task (re-apply would report `unchanged`).

## Error handling
- `approval <id> has not been granted`: wait; do not retry with another id.
- `unknown node`: mapping missing; reconcile, then re-apply from spec.
- Repeated conflicts on the same node: stop and escalate to the orchestrator.

## Related
- `design-validation`, `visual-qa` — sources of fix requests.
- `figma-layer-organization` — renaming as part of fixes.
