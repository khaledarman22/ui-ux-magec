---
name: project-continuity
description: Resume a project across sessions faithfully — reconstruct context, reconcile Figma, settle interrupted operations — without recreating deleted work or reviving deleted projects.
category: specialized
agents: [workspace-manager]
tools: [magec_project_status, magec_project_context, magec_memory_search, magec_artifact_read, magec_figma_status, magec_figma_reconcile, magec_figma_snapshot, magec_task_list, magec_task_get, magec_message_send, magec_checkpoint_create]
related: [workspace-management, project-state-validation, memory-management, cache-management]
---

# Project continuity

## Purpose
Users return days later, possibly after editing Figma by hand. Continuity means every agent picks up from the
recorded state: same decisions, same task graph, Figma mappings matched to the live file, interrupted writes
settled. It never means rebuilding what the user deleted.

## When to use
- Start of a new session on an existing workspace.
- `figma-reconcile` tasks.
- After crashes, timeouts or a long gap between sessions.

## Inputs
- `magec_project_status` (phase, running/failed tasks, approvals waiting), `magec_project_context` (brief, decisions, rejected directions, assumptions, feedback).
- `figma/mappings.json`, `figma/operations.jsonl` (journal), last `figma/reconcile.json`.

## Outputs
- `figma/reconcile.json` (written by `magec_figma_reconcile`): `fileMatches`, `checked`, `ok`, `missing`,
  `changedExternally`, `relinked`, `recoveredOperations`, `abandonedOperations`.
- A short continuity summary to `master-orchestrator` via `magec_message_send`.

## Tool requirements
- `magec_figma_reconcile` — compares mappings with the live file; marks nodes `missing` or `changed-externally`, relinks moved ids, settles `pending` journal entries (adopted if all nodes exist, else abandoned). Never recreates anything.
- `magec_figma_snapshot` — refresh the structural picture if the file changed a lot.

## Instructions
1. Read status and context; note running tasks left from the last session, failed tasks, pending approvals.
2. `magec_figma_status`: confirm the plugin is open in the linked file. A different file is a stop condition.
3. Run `magec_figma_reconcile`. Interpret:
   - `missing`: the user (or someone) deleted these nodes. They stay deleted unless a task explicitly redesigns them.
   - `changedExternally`: user edits; future writes will be refused until approved or accepted. Tell the orchestrator.
   - `recoveredOperations` / `abandonedOperations`: interrupted writes are settled; retries cannot duplicate nodes.
4. Snapshot if many changes were found.
5. Summarize to the orchestrator: what is current, what changed in Figma, which tasks need attention, which decisions govern next steps.
6. Create a checkpoint labelled "session resume" when reconciliation changed mapping state.

## Constraints
- Never recreate designs deleted in Figma; never mark missing nodes active.
- Never resurrect a deleted project or workspace; a new `magec_project_init` always creates a new project id and must not be used for recovery.
- Do not resolve conflicts yourself; accepting external changes needs a user-approved approval and is done by figma-designer.
- Context comes from the workspace, not from recollection of previous chats.

## Validation
- Reconcile report `fileMatches: true`; every mapping is in exactly one of `ok` / `missing` / `changedExternally`.
- No pending journal entries remain after reconcile.

## Error handling
- File mismatch or plugin closed: report "open the linked file and run the plugin"; do not proceed with Figma steps.
- Workspace missing: report to the orchestrator; never re-create it from memory, cache or checkpoints of another project.
- Corrupt state file: hand over to `project-state-validation`.

## Related
- `project-state-validation`, `workspace-management`, `memory-management`.
