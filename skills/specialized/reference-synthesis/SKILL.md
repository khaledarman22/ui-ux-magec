---
name: reference-synthesis
description: Combine visual-analysis reports and research findings into transferable principles and directions, citing reference ids and rejecting unsuitable references and style mixes.
category: specialized
agents: [creative-director]
tools: [magec_artifact_read, magec_reference_list, magec_reference_select, magec_reference_reject, magec_reference_mark_used, magec_memory_search, magec_project_context, magec_message_send]
related: [creative-direction, concept-generation, originality-review, ux-pattern-analysis, design-trend-analysis]
---

# Reference synthesis

## Purpose
References are evidence, not templates. This skill reads what the research and visual-analysis agents found and
distils it into principles a concept can build on, with the reference ids that support each one, so concepts are
grounded without copying.

## When to use
- At the start of every `concept-generation` task, after reading the inputs.
- When feedback asks for "something like X but ours".

## Inputs
- `research/visual-analysis-<category>.json`: `patterns`, `usabilityVsAppeal`, `recommendations`, `analysisIds`.
- Saved analyses (`references/analyses/*.json`): `principles`, `strengths`, `weaknesses`, `scores`, `style`.
- `research/report-<category>.json`: `insights`, `approaches`.
- Rejected directions from memory.

## Outputs
- A working list (in your notes or the concepts brief): principle → supporting reference ids → which concept may use it.
- Rejections via `magec_reference_reject` (ids go to `rejectedReferenceIds`).
- Usage recorded with `magec_reference_mark_used` for references that actually informed the recommended concept.

## Tool requirements
- `magec_artifact_read` — reports and analyses.
- `magec_reference_select` — find diverse supporting references with `avoidStyles` and `excludeIds`.
- `magec_reference_reject`, `magec_reference_mark_used` — curation and usage tracking.

## Instructions
1. Read patterns and recommendations across all relevant categories; list principles in your own words ("primary action visible without scrolling on mobile listing pages").
2. Attach the reference ids that demonstrate each principle; prefer principles supported by several references and sources.
3. Use `usabilityVsAppeal` to decide which visual ideas need a usability safeguard.
4. Map research gaps to differentiation opportunities for concepts.
5. Reject references that conflict with the brand, the audience, accessibility, or a rejected direction, with a specific reason.
6. Identify incompatible style mixes (e.g. playful 3D illustration with austere luxury typography) and list them for `avoided`.
7. After the recommended concept is chosen, call `magec_reference_mark_used` with the ids it cites, so future selection diversifies.
8. If a key reference lacks a saved analysis, ask the visual-analysis agent via `magec_message_send` instead of guessing what it looks like.

## Constraints
- Cite only verified references with saved analyses; never cite a reference you only know by title.
- Do not judge visuals you have not seen in an analysis; you have no preview tool in this role.
- Principles must transfer to this product; drop ones that only work for the reference's own brand.

## Validation
- Each principle has at least one reference id; most have two or more.
- Every rejected reference has a reason; every cited id exists in `magec_reference_list`.

## Error handling
- Analyses disagree: prefer evidence with higher `usability` and `relevance` scores and note the disagreement.
- Too few analyses: rely on research `insights` and mark the resulting principles as weaker evidence.

## Related
- `ux-pattern-analysis`, `design-trend-analysis` — upstream syntheses.
- `concept-generation`, `originality-review` — consumers of these principles.
