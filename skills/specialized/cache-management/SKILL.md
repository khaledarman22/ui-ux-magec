---
name: cache-management
description: Treat the project cache as disposable, recomputable data — understand categories, lifetimes and invalidation — and keep it strictly separate from authoritative memory and state.
category: specialized
agents: [workspace-manager]
tools: [magec_figma_snapshot, magec_figma_status, magec_project_status, magec_artifact_read, magec_message_send, magec_figma_read]
related: [memory-management, workspace-management, project-continuity, project-state-validation]
---

# Cache management

## Purpose
The cache (`.ui-ux-magec/cache/`, `packages/cache/src/index.ts`) speeds up research, previews, Figma reads and
asset processing. Every entry must be recomputable; nothing in it is project truth. This skill keeps agents from
relying on stale data and from confusing cache with memory.

## When to use
- When results look stale (old snapshot, outdated reference preview).
- When another agent asks whether cached data can be trusted.
- During continuity or validation checks.

## Inputs
- Categories and default lifetimes: `research-results` 7 days, `reference-metadata` 14 days,
  `reference-previews` 30 days, `agent-temp` 24h, `robots` 24h; no TTL (dependency-invalidated) for
  `visual-analysis`, `figma-metadata`, `figma-nodes`, `asset-processing`, `rendered-previews`.
- Entry fields: `source`, `createdAt`, `expiresAt`, `contentHash`, `validation` (`valid` | `stale` | `invalid`), `dependencies` (e.g. `figma-file:<key>`, `figma-node:<id>`).

## Outputs
- Refreshed data through the owning tool (e.g. a new snapshot) and advice to agents on freshness.

## Tool requirements
- `magec_figma_snapshot` — the supported way to refresh `figma-metadata` (`snapshot` key) and `figma/snapshot.json`.
- No MCP tool exposes cache prune/invalidate; those are runtime-service operations (`invalidate`, `invalidateByDependency`, `prune`). Ask the orchestrator if a forced invalidation is needed.

## Instructions
1. Prefer authoritative sources: `figma/mappings.json`, live `magec_figma_read`, `memory/`, task outputs. Use cache only as an accelerator inside tools.
2. Judge freshness by the dependency, not age alone: a Figma snapshot is stale after any write or external edit (reconcile reports `changedExternally`/`missing`).
3. Refresh by recomputing through the owning tool (snapshot, reference preview, research search) rather than editing cache files.
4. Integrity: entries whose payload hash mismatches are invalidated automatically; a corrupt index is rebuilt empty. Neither is data loss.
5. Separation: never write decisions, approvals or feedback into cache, and never promote cached research/analysis into memory without the owning agent's task output.
6. Cache cleanup (prune) only removes invalid or expired cache entries; it never touches memory, checkpoints, artifacts or assets.

## Constraints
- Never write under `cache/` with `magec_artifact_write` (it is not a writable area).
- Never treat a cache hit as proof that a Figma node or reference still exists.
- Cache clearing is never used as a substitute for deleting project data, and project data is never deleted to "clean up".

## Validation
- After a refresh, the snapshot `takenAt` is newer than the last Figma operation in the journal.
- No agent output cites cache paths as sources of truth.
- Cache stats show no growth of `invalid` entries left unpruned across sessions (report if they do).
- Memory and checkpoints are untouched by any cache operation.

## Error handling
- Cache unreadable or corrupt: proceed without it; recompute through tools.
- Stale preview path referenced in a report: ask the producing agent to re-export (previews in `reports/previews/` are artifacts, not cache).

## Related
- `memory-management` — authoritative counterpart.
- `project-continuity` — refreshes after sessions.
