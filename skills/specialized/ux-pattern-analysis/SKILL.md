---
name: ux-pattern-analysis
description: Synthesize inspected analyses into cross-reference UX patterns, separate visual appeal from usability, and submit the category's VisualAnalysisReport.
category: specialized
agents: [visual-analysis-agent]
tools: [magec_reference_list, magec_artifact_read, magec_reference_select, magec_memory_search, magec_project_context, magec_task_complete, magec_task_fail, magec_message_send]
related: [visual-composition-analysis, layout-analysis, typography-analysis, color-analysis, reference-synthesis, structured-output]
---

# UX pattern analysis

## Purpose
Individual analyses describe references; the creative director needs patterns: what several good references do
for this feature, why it works, and where beauty and usability diverge. This skill writes the
`VisualAnalysisReport` at `research/visual-analysis-<category>.json`.

## When to use
- Final step of every `visual-analysis` task, after all inspected references have saved analyses.

## Inputs
- The analyses saved in this task (`references/analyses/*.json`, ids returned by `magec_reference_save_analysis`).
- Feature, audiences and states from `planning/product-analysis.json`; the research report's `approaches`.

## Outputs
`VisualAnalysisReport`:
- `category`; `analysisIds` (min. 1, only analyses saved from real inspection).
- `patterns[]` (min. 1): `name`, `description`, `referenceIds`.
- `usabilityVsAppeal`: where the most attractive references hurt usability and vice versa.
- `recommendations[]`: principles for concepts and designers, tied to the product's needs.

## Tool requirements
- `magec_artifact_read` — read saved analyses and the research report.
- `magec_task_complete` — submit the report; claims are cross-checked against saved analyses.
- `magec_message_send` — optional note to the creative director about a key risk or gap.

## Instructions
1. Group analyses by `layout_label`, `components` and `principles`. A pattern needs at least two references.
2. Name patterns by what they do: "persistent applied-filter chips", "price-first card hierarchy", "full-screen mobile filter sheet with sticky apply".
3. Describe why each pattern helps the product's audience, including which feature states it covers (empty, loading, error) when seen.
4. Write `usabilityVsAppeal` concretely: "ref_b3 and ref_d7 have the strongest visual impact but hide filters behind an icon and set body text on photos; ref_a1 is plain but makes comparison fastest."
5. Recommendations are principles, not instructions to copy: "Keep active filters visible above results", "Pair price with monthly cost in the same type size".
6. Include RTL and Arabic considerations when the project needs them.
7. Note gaps: needs from the product analysis that no inspected reference addressed.
8. Submit with `magec_task_complete`. Leave `magec_reference_mark_used` to the agent whose concept or design actually uses a reference; do not call it just for analysing.

## Constraints
- `analysisIds` lists only analyses saved in this or earlier tasks from real inspection; skipped references are not listed.
- Every pattern cites the reference ids it came from.
- Do not recommend reproducing any single reference's layout or branding.

## Validation
- The report parses as `VisualAnalysisReport`.
- Every referenced id has a saved analysis.
- At least one tension between appeal and usability is identified, or the report states none was observed.

## Error handling
- Only one reference could be inspected: report its patterns as single-source observations and say so in `usabilityVsAppeal`.
- Claim errors on submit: remove the unsupported ids and resubmit; after two failed corrections, `magec_task_fail` with kind `validation`.

## Related
- `visual-composition-analysis`, `layout-analysis`, `typography-analysis`, `color-analysis` — per-reference inputs.
- `reference-synthesis` — consumes this report.
- `structured-output` — submission rules.
