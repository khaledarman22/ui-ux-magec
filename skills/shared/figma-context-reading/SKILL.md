---
name: figma-context-reading
description: Read the connected Figma file through the magec bridge (status, snapshot, reads, reconcile) and understand mappings, ownership and user edits before acting.
category: shared
agents: []
tools: [magec_figma_status, magec_figma_read, magec_figma_snapshot, magec_figma_reconcile, magec_artifact_read]
related: [context-management, quality-standards, error-handling]
---

# Figma context reading

## Purpose
The Figma file is shared with the user, who can edit it at any time. The runtime records what the project
created in `figma/mappings.json` (logical id → node id, fingerprint) and journals every write. This skill
shows how to read Figma state safely and how to interpret ownership and external edits before any decision
or write.

## When to use
- Before any Figma-related task (design, fix, QA, audit, snapshot, reconcile).
- When a write reports a conflict or a node is missing.
- When auditing an existing design the project did not create.

## Inputs
- `magec_figma_status`: bridge/plugin connection, connected file, supported operations, project's Figma link.
- `figma/snapshot.json` (pages, frames, components, styles, variables) and `figma/mappings.json`.
- Live reads: `ping`, `get_capabilities`, `read_document`, `read_node`, `read_selection`, `read_components`,
  `read_styles`, `read_variables`, `list_fonts`, `find_by_logical_ids`, `export_node`.

## Outputs
- An accurate picture of what exists, what the project owns, and what the user changed.

## Tool requirements
- `magec_figma_status` — always first.
- `magec_figma_read` — one read-only operation per call, e.g. `{ "op": "read_node", "nodeId": "12:34", "depth": 3 }`.
- `magec_figma_snapshot` — whole-file inventory into the workspace and cache.
- `magec_figma_reconcile` — compare mappings with the live file; detect missing nodes and external edits;
  settle interrupted operations.
- `magec_artifact_read` — read snapshot, mappings and reconcile reports.

## Instructions
1. Call `magec_figma_status`. If not connected, or connected to a different file than the project's link,
   stop and report; never work on the wrong file.
2. For broad understanding, read `figma/snapshot.json`; refresh with `magec_figma_snapshot` only when stale or
   missing (your agent must have that tool).
3. For specific nodes, prefer `find_by_logical_ids` (project-owned nodes) or `read_node` with a modest depth.
   Avoid deep full-document reads.
4. Interpret ownership: nodes in mappings were created by the project; everything else is user-made and must
   never be modified or deleted by the project.
5. Run `magec_figma_reconcile` (or read `figma/reconcile.json`) before edits to see which owned nodes were
   edited externally or deleted by the user.
6. Treat user edits as intentional. Overwriting them requires an approval the user granted; accepting them as
   the new baseline uses `magec_figma_accept_external_changes` after the user confirms (figma-designer).
7. Nodes the user deleted stay deleted; reconciliation never recreates them.
8. For visual inspection use `magec_figma_export_preview` (where allowed) rather than base64 `export_node`.

## Constraints
- Read-only: this skill never writes. Only the figma-designer writes, inside a running task.
- Cache copies of Figma data are disposable; confirm against the live file before acting on them.
- Do not assume layer names are stable; use logical ids and node ids.

## Validation
- Every node id you cite was returned by a read, the snapshot or the mappings in this task.
- Conflicts and missing nodes are reported, not ignored.

## Error handling
- Bridge offline / plugin closed: fail with kind `external` and ask the user to open the plugin.
- Node not found: check reconcile; if the user deleted it, report it as deleted rather than recreating it.
- Read timeouts on large files: reduce depth or scope to a page.

## Related
- `context-management` — combining Figma and workspace context.
- `quality-standards` — what to verify on live nodes.
- `error-handling` — classifying bridge failures.
