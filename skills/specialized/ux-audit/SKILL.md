---
name: ux-audit
description: Run the ux-audit task on an existing (possibly partial) Figma file — inspect what exists first, then report flows, gaps and scoped proposed work in the UXAuditReport contract.
category: specialized
agents: [ux-audit-agent]
tools: [magec_task_start, magec_task_complete, magec_task_fail, magec_project_context, magec_artifact_read, magec_figma_status, magec_figma_snapshot, magec_figma_read, magec_figma_export_preview, magec_memory_search, magec_assumption_record, magec_artifact_write]
related: [gap-detection, usability-analysis, flow-validation, improvement-planning]
---

# UX audit

## Purpose
Owns the `ux-audit` task in the audit workflow (snapshot → audit → optional research for gaps). The goal is to
understand an existing design before anyone recommends work, and to produce `reports/ux-audit.json`
(`UXAuditReport`) that downstream agents can act on without re-inspecting the file.

## When to use
- When a `ux-audit` task is assigned (params `mode`: `audit` | `suggest` | `extend`).
- When the user asks "what is missing / what is wrong" about an existing Figma file.

## Inputs
- `figma/snapshot.json` (produced by workspace-manager's `figma-snapshot` task); refresh with `magec_figma_snapshot` if absent or stale.
- Brief and, if present, `planning/product-analysis.json` (features, states, user flows).
- Memory: prior audit decisions and rejected directions (`magec_memory_search` `audit`).

## Outputs
`UXAuditReport` via `magec_task_complete`:
```json
{
  "mode": "suggest",
  "inspected": { "pages": ["Home", "Checkout"], "frames": 14, "components": 22 },
  "existingSystem": { "colors": ["#0E5A8A", "#F5F7F9"], "typography": ["Inter 16/24 Regular", "Inter 32/40 SemiBold"], "components": ["Button", "Input", "Card"] },
  "flows": [{ "name": "Checkout", "status": "incomplete", "notes": "No payment error or success screen" }],
  "gaps": [{ "id": "gap-checkout-error", "kind": "missing-state", "description": "Payment failure state missing", "severity": "major",
             "location": "Checkout / Payment — desktop", "recommendation": "Add inline error and retry state using existing Input error variant" }],
  "proposedWork": [{ "title": "Checkout error and success states", "page": "checkout", "rationale": "Completes the purchase flow" }]
}
```

## Tool requirements
- `magec_figma_status` — confirm the linked file before reading.
- `magec_figma_read` — `read_document` (`includeFrames`), `read_node` (depth for structure), `read_components`, `read_styles`, `read_variables`.
- `magec_figma_export_preview` — export key frames and look at them; structure alone misses visual problems.

## Instructions
1. Start the task; read mode, brief, product analysis and the snapshot.
2. Inventory: pages, top-level frames per page (count them), components, styles, variables. Fill `inspected` and `existingSystem` from what you read, not from assumptions.
3. Export previews of representative frames (each page's main frame per breakpoint) and inspect them.
4. Map flows (`flow-validation`), detect gaps (`gap-detection`), assess usability and accessibility (`usability-analysis`).
5. Plan scoped work (`improvement-planning`) — required in `suggest` and `extend`, optional in `audit`.
6. Write long notes, if any, to `reports/ux-audit-notes.md`; keep the contract concise.
7. Complete; fix schema errors only.

## Constraints
- Read-only: you never write to Figma.
- Understand before recommending: no gap without a location you inspected.
- Respect the existing design language; recommendations reuse existing components and styles.
- No wholesale redesign proposals unless the user asked for one.

## Validation
- `inspected` counts match the snapshot/reads; every gap has `location` and `recommendation`.
- Every flow from product analysis appears in `flows` with a status.
- Severity follows impact (critical = blocks a core task; major = significant friction or AA failure; minor = polish).

## Error handling
- Figma not connected: use the snapshot if present and state in the notes that live reads and previews were unavailable; if neither exists, `magec_task_fail` kind `external`.
- File too large: audit pages in sitemap priority order, and state which pages were not inspected in the notes.
- No product analysis: infer flows from page names and record assumptions.

## Related
- `gap-detection`, `usability-analysis`, `flow-validation`, `improvement-planning`.
