---
name: usability-analysis
description: Assess an existing design's usability and accessibility from exported previews and node data — hierarchy, clarity, feedback, forms, touch and bilingual quality.
category: specialized
agents: [ux-audit-agent]
tools: [magec_figma_export_preview, magec_figma_read, magec_contrast_check, magec_artifact_read, magec_memory_search]
related: [ux-audit, gap-detection, flow-validation, accessibility-review]
---

# Usability analysis

## Purpose
Structural inventory says what exists; usability analysis says whether people can use it. This skill inspects
real previews and node properties and turns findings into `gaps` of kind `accessibility`, `inconsistency`,
`content` or `other`, each with a fix that fits the current design.

## When to use
- Inside `ux-audit` after the inventory, for the most important pages first.
- When users report confusion on a specific screen.

## Inputs
- Previews exported with `magec_figma_export_preview` (paths under `reports/previews/`).
- Node data via `magec_figma_read` `read_node` (font sizes, fills, sizes, auto layout, text alignment).
- Audience and context from the brief/product analysis.

## Outputs
- Gap entries with evidence and recommendation.
- Optional notes in `reports/ux-audit-notes.md` (written by `ux-audit`).

## Tool requirements
- `magec_figma_export_preview` — open each PNG with host `Read` and look at it.
- `magec_contrast_check` — measure, never estimate, contrast.

## Instructions
1. Prioritize pages by importance (entry pages, conversion flows) and inspect desktop and mobile previews.
2. Hierarchy: one clear primary action per view; headline → supporting text → action order; competing CTAs flagged.
3. Clarity: labels say what happens ("Book viewing", not "Submit"); icons without labels in critical actions flagged.
4. Feedback: interactive elements show states; forms show validation and success; destructive actions confirm.
5. Forms: visible labels, sensible grouping, input types match data, error text next to fields, required fields marked.
6. Readability: body ≥ 16px web, line length ~45–90 characters, adequate line height; measure contrast for small and muted text.
7. Touch (mobile frames): targets ≥ 44×44, spacing between adjacent targets, primary actions reachable.
8. Bilingual/RTL: Arabic font present, right alignment, mirrored layout, directional icons mirrored, no clipped diacritics.
9. Write each finding as a gap with the frame location, evidence (e.g. "3.1:1 #8A97A0 on #FFFFFF at 14px"), severity and a fix using existing styles/components.

## Constraints
- Distinguish usability from taste; aesthetic preference alone is not a gap.
- Do not claim visual findings for frames you did not preview.
- Do not propose a new visual language; fix within the existing one unless mode and brief call for redesign.

## Validation
- Every accessibility finding has a measurement or concrete node property.
- Findings reference real frames; previews used exist on disk.

## Error handling
- Export fails for a frame: analyse its node data only and mark the finding "structural only" in the description.
- Text rendered as image (flattened): report as `accessibility` gap (not editable, not translatable).

## Related
- `accessibility-review` — the QA counterpart for newly generated designs.
- `gap-detection`, `flow-validation`.
