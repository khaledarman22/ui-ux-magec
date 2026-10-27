---
name: responsive-qa
description: Verify every required breakpoint and direction exists for a page and that each adapts correctly, including RTL mirroring and mobile touch targets.
category: specialized
agents: [design-qa-agent]
tools: [magec_qa_run, magec_figma_export_preview, magec_figma_read, magec_project_context, magec_artifact_read]
related: [design-validation, visual-qa, accessibility-review, figma-responsive-layout]
---

# Responsive QA

## Purpose
A page passes only if it works at every breakpoint and direction the project specifies. The structural
`responsive-coverage`, `touch-target` and `rtl-alignment` rules catch the measurable part; this skill adds the
side-by-side visual check that layouts actually adapt rather than shrink.

## When to use
- Every `design-qa` task for a page with more than one breakpoint or with RTL screens.

## Inputs
- `settings.breakpoints` (default desktop + mobile) and project `direction` from `magec_project_context`.
- `magec_qa_run` results: coverage issues, touch-target and RTL issues, previews per screen.
- `layoutRules` / component `responsive` notes in `design-system/design-system.json`.

## Outputs
- Coverage and adaptation issues (structural ones as returned, visual ones with `source: "visual"`).

## Tool requirements
- `magec_qa_run` with `page` set — only then is expected coverage (page × breakpoints) checked; without it `responsive-coverage` is skipped.
- `magec_figma_read` `read_node` — confirm screen meta (`breakpoint`, `direction`) and widths.

## Instructions
1. Run `magec_qa_run` with `page`; note `responsive-coverage` status and `missingScreens`.
2. Expected set: `<page>-<breakpoint>` for each breakpoint in settings; in `both` projects also `-rtl` copies.
   Coverage only checks `<page>-<breakpoint>` ids, so verify RTL copies yourself and report missing ones as `major`.
3. Compare previews of all breakpoints side by side: same sections in the same order, consistent content, grids changed per rules (columns, margins), navigation collapsed on mobile.
4. Mobile: body text not below 16px, nothing overflowing horizontally, primary action visible without hunting, targets ≥ 44×44 (structural rule covers named interactive layers; visually check others).
5. RTL: whole layout mirrored (logo/nav order, alignment, progress and arrows), Arabic text right-aligned with the Arabic font, numerals and logos not mirrored, no clipped diacritics.
6. Tablet (if required): not simply desktop squeezed or mobile stretched.
7. Report each problem with screen id, logicalId when known, and a fix tied to the layout rules.

## Constraints
- Judge each breakpoint on its own terms; a mobile screen is not wrong for omitting desktop-only secondary content if the rules allow it.
- Do not require breakpoints that settings do not list; do not skip ones they do.
- A skipped structural rule stays skipped; do not reinterpret it as passed.

## Validation
- Every expected screen is either present or reported missing.
- RTL findings cite the RTL screen id.
- Each adaptation issue references the layout rule it violates.
- Severity: missing required screen `major`; broken layout or unreachable primary action `major`; spacing/polish `minor`.

## Error handling
- Screen exists in mapping but not in Figma (`missingScreens`): report as missing; reconcile is handled in `design-validation`.
- Screen meta absent (designed outside the spec): judge by width and note the uncertainty.
- Final iteration (`iteration` = `maxQaIterations`) with coverage still missing: keep the issue and list it in `remainingLimitations`.

## Related
- `figma-responsive-layout`, `responsive-patterns` — what is expected.
- `design-validation` — the report.
