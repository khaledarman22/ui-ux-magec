---
name: visual-composition-analysis
description: Inspect each verified reference's actual preview image, then record its composition, hierarchy, imagery and overall structure as a ReferenceAnalysis.
category: specialized
agents: [visual-analysis-agent]
tools: [magec_task_start, magec_reference_list, magec_reference_select, magec_reference_preview, magec_reference_save_analysis, magec_reference_reject, magec_artifact_read, magec_task_fail]
related: [layout-analysis, typography-analysis, color-analysis, ux-pattern-analysis, source-validation]
---

# Visual composition analysis

## Purpose
This is the entry skill of every `visual-analysis` task: it decides which references to inspect, makes sure each
one is actually seen, and produces one `ReferenceAnalysis` per reference. The other visual skills fill specific
fields of the same analysis; `ux-pattern-analysis` then writes the category report.

## When to use
- Every `visual-analysis` task (`params.category`), after the matching research task.
- When a concept or QA question needs a reference re-inspected.

## Inputs
- `research/report-<category>.json` (`referenceIds`, `approaches`).
- `magec_reference_list({ category, verifiedOnly: true })`.

## Outputs
Per reference, via `magec_reference_save_analysis`: `reference_id`, `inspected { method, artifact }`,
`layout_structure`, `visual_hierarchy`, `imagery`, `components[]`, `strengths[]` (min. 1), `weaknesses[]`,
`principles[]`, `scores { visual_appeal, usability, relevance, originality }` (0-1), `style[]`, `layout_label`
(plus the fields owned by the other visual skills).

## Tool requirements
- `magec_reference_preview` — `referenceId`; returns a local preview image path, or `previewPath: null` with a reason.
- Host `Read` on that path — the actual visual inspection of the image.
- `magec_reference_save_analysis` — stores the analysis; analyses without inspection are rejected.

## Instructions
1. Start the task; take the report's `referenceIds`. If more than about 10, use `magec_reference_select` to choose a diverse subset.
2. For each reference: call `magec_reference_preview`, then open the returned image file with the host `Read` tool. Set `inspected.method: "preview-image"` and `inspected.artifact` to that path.
3. If there is no preview: inspect the live page with the host browser if available (`method: "live-page"`) or a user-supplied screenshot (`method: "screenshot"`). A text-only fetch shows structure, not visuals; limit claims accordingly. If nothing can be inspected, skip the reference.
4. Describe what the image shows: entry point, reading path (Z, F, centered, split), focal element, density, use of whitespace, imagery style (photo, 3D, illustration, none) and how imagery and text interact.
5. `visual_hierarchy`: rank the first three things the eye lands on and why (size, contrast, position).
6. `principles`: transferable rules, not descriptions ("one dominant visual per viewport, supporting text kept under 60ch"), so concepts can reuse ideas without copying.
7. Score independently: `visual_appeal` is not `usability`; a striking hero with unreadable copy scores high on one and low on the other.
8. Reject references that turn out irrelevant or broken on inspection with `magec_reference_reject` and a reason.

## Constraints
- Analyse only what you actually inspected in this task; never infer visuals from the title, URL or search snippet.
- A preview usually shows one viewport or one shot: do not describe sections, states or responsive behaviour you did not see.
- Do not transcribe large amounts of a reference's copy or reproduce its branding in notes.

## Validation
- Every saved analysis has `inspected.method` and an artifact path or live-page note.
- `strengths` has at least one specific item; scores are within 0-1.
- Number of analyses equals the number of references actually inspected.

## Error handling
- Preview download fails: try once more via `magec_reference_preview`, then fall back to live page or skip with a note.
- No reference in the category can be inspected: `magec_task_fail` with kind `external` explaining why.

## Related
- `layout-analysis`, `typography-analysis`, `color-analysis` — field-level detail.
- `ux-pattern-analysis` — cross-reference report.
- `source-validation` — verified-only rule.
