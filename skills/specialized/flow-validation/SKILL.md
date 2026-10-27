---
name: flow-validation
description: Trace each user flow through the existing frames and classify it complete, incomplete or missing, with the exact break points.
category: specialized
agents: [ux-audit-agent]
tools: [magec_artifact_read, magec_figma_read, magec_figma_export_preview, magec_assumption_record, magec_memory_search]
related: [ux-audit, gap-detection, usability-analysis, improvement-planning]
---

# Flow validation

## Purpose
Users accomplish tasks through sequences of screens. This skill walks each flow step by step across the Figma
file and fills `UXAuditReport.flows[]`, producing navigation and missing-screen/state gaps where the chain breaks.

## When to use
- Inside every `ux-audit` task.
- Before planning extensions, to know which flows the new work must complete.

## Inputs
- `userFlows` from `planning/product-analysis.json` (`name`, `actor`, `steps`); otherwise infer core flows from the brief and page set and record assumptions.
- Frames per page from the inventory; prototype links are not required (often absent).

## Outputs
- `flows[]`: `{ "name": "Book a viewing", "status": "complete" | "incomplete" | "missing", "notes": "Step 3 (pick time) has no mobile frame; no confirmation screen" }`.
- Related gaps (`missing-screen`, `missing-state`, `navigation`) with matching locations.

## Tool requirements
- `magec_figma_read` `read_document` / `read_node` — locate frames and the controls that lead to the next step.
- `magec_figma_export_preview` — confirm a step is visually present and coherent.

## Instructions
1. List flows to validate: all `must` features' flows first, then `should`.
2. For each step, find the frame that represents it (by name and content). Record the frame for notes.
3. Check the transition: a visible control leads to the next step (button, link, card), and a way back exists.
4. Check required states at each step: loading for async steps, empty results, validation errors, success confirmation.
5. Check coverage per breakpoint in settings and per direction (RTL) for each step.
6. Classify:
   - `complete` — every step and essential state exists for all required breakpoints.
   - `incomplete` — some steps/states/breakpoints missing; list exactly which.
   - `missing` — the flow's entry or core step does not exist.
7. Create one gap per break with location and recommendation; link gap ids in `notes` when helpful.

## Constraints
- Validate against frames as they exist now; a frame deleted in Figma is a missing step, not a step to assume.
- A flow is not complete because the happy path exists; error and empty paths count.
- Do not invent steps beyond the product's needs; keep flows minimal.
- Record inferred flows as assumptions.

## Validation
- Each flow's status is justified in `notes` with the missing step or "all steps present".
- Every `incomplete`/`missing` flow has at least one corresponding gap.
- Flow names match `userFlows` names when product analysis exists.

## Error handling
- Ambiguous frame names: open the frame preview; if still unclear, note "step not identifiable" rather than guessing.
- Flow spans pages that were not inspected (large file): mark `incomplete` with "partially inspected".

## Related
- `gap-detection` — consumes break points; `improvement-planning` — prioritizes completing flows.
