---
name: design-validation
description: Run the design-qa task — structural QA on live Figma nodes, visual review of exported previews, and an honest QAReport that drives a bounded fix loop.
category: specialized
agents: [design-qa-agent]
tools: [magec_task_start, magec_task_complete, magec_task_fail, magec_project_context, magec_figma_status, magec_figma_reconcile, magec_qa_run, magec_artifact_read, magec_message_send]
related: [visual-qa, responsive-qa, component-consistency, accessibility-review, figma-node-editing]
---

# Design validation

## Purpose
Owns the `design-qa` task. It verifies what was actually written to Figma (read back live, never the intended
spec), combines structural and visual findings, and produces `reports/qa-<page>-<id>.json` (`QAReport`). The
orchestrator uses `passed` and the blocking issues to schedule a `figma-fix` task and the next QA iteration,
up to `settings.maxQaIterations` (default 3).

## When to use
- Every `design-qa` task (params `page`, `iteration`, optionally `review: true` for one-off reviews without a fix loop).

## Inputs
- Task params; `figma/mappings.json` (screens written through the bridge); concept and product analysis for requirement checks.
- `settings.maxQaIterations` and `settings.breakpoints` from `magec_project_context`.
- Previous QA reports for this page (`reports/qa-<page>-*.json`) to confirm earlier issues are fixed.

## Outputs
`QAReport` via `magec_task_complete`: `scope`, `iteration`, `structuralChecks[{rule,status,note}]`,
`visualReview{performed,previews,notes}`, `issues[]`, `passed`, `remainingLimitations[]`.

## Tool requirements
- `magec_figma_status` then `magec_qa_run { page, iteration, exportPreviews: true, scale: 0.5 }` (or `screenIds`).
- Host `Read` on each returned preview `absolutePath` for the visual review.
- `magec_figma_reconcile` when screens are reported missing.

## Instructions
1. Start the task; read `page` and `iteration`; check status.
2. Run `magec_qa_run`. It reads screen roots `screen/<page>` and `screen/<page>-*`, runs the 13 structural rules
   (`text-contrast`, `missing-font`, `clipping`, `overflow`, `spacing-scale`, `type-scale`, `color-palette`,
   `layer-naming`, `placeholder-content`, `touch-target`, `rtl-alignment`, `empty-frame`, `responsive-coverage`), and exports previews.
3. Copy `checks` into `structuralChecks` unchanged — including `skipped` with their notes. Copy structural issues unchanged.
4. Do the visual review (`visual-qa`, `responsive-qa`, `component-consistency`, `accessibility-review`); add findings as issues with `source: "visual"`.
5. Set `visualReview.performed: true` only if you opened and inspected the preview images; list exactly those workspace paths (`reports/previews/...png`).
6. `passed` = no `critical` or `major` issues. If the visual review was not performed, `passed` may still be true but add "visual review not performed" to `remainingLimitations`.
7. If `iteration` ≥ `maxQaIterations` and blockers remain, set `passed: false` and list every remaining blocker in `remainingLimitations`; the loop stops there.
8. Complete. Each blocking issue needs a `suggestion` the figma-designer can act on.

## Constraints
- Never mark a check passed that did not run; never drop issues to make a page pass.
- Never fix designs yourself; you have no write tools.
- Reports describe the live file; if a screen is missing, say so — do not QA the spec instead.

## Validation
- Runtime cross-checks: previews exist, structural checks present, `passed` consistent with blockers.
- Previously reported blockers are either gone or still listed.

## Error handling
- `no designed screens found`: complete with an empty-scope report only if the task says so; otherwise `magec_task_fail` kind `validation` ("nothing written for page").
- `missingScreens` non-empty: run reconcile, report them as `responsive-coverage`/critical issues if deleted, and never request recreation of designs the user deleted without the orchestrator's decision.
- Bridge down: `magec_task_fail` kind `external`.

## Related
- `visual-qa`, `responsive-qa`, `component-consistency`, `accessibility-review`.
- `figma-node-editing` — how the designer fixes reported issues.
