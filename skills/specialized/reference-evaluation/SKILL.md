---
name: reference-evaluation
description: Judge verified references for relevance, quality and fit, reject unsuitable ones with reasons, and pick a diverse final set with magec_reference_select.
category: specialized
agents: [research-agent]
tools: [magec_reference_list, magec_reference_select, magec_reference_preview, magec_reference_reject, magec_project_context, magec_artifact_read, magec_task_complete]
related: [reference-discovery, source-deduplication, design-trend-analysis, source-validation, structured-output]
---

# Reference evaluation

## Purpose
A research report should hand visual analysis a focused, varied set, not every URL found. This skill filters the
category's references, rejects weak or misleading ones, ranks the rest for diversity, and fills the
`ResearchReport` fields that depend on judgement.

## When to use
- End of every `research` task, after discovery and deduplication.
- When the creative director or user flags a reference as off-target.

## Inputs
- `magec_reference_list` for the category (verified only by default).
- Product analysis (feature, audiences, market) and rejected directions.

## Outputs
`ResearchReport` at `research/report-<category>.json`:
- `category`, `summary` (what was found, coverage gaps), `referenceIds` (verified only).
- `sourcesTried[]` with `source`, `status`, `note`.
- `insights[]` (observations tied to the feature) and `approaches[]` (`name`, `description`, `referenceIds`).

## Tool requirements
- `magec_reference_select` — `category`, `industry`, `keywords`, `avoidStyles`, `excludeIds`, `limit`, `lambda` (relevance vs diversity, default 0.7), `includeUnverified` (keep false).
- `magec_reference_reject` — `referenceId`, `reason` (min. 3 chars).
- `magec_reference_preview` — check what is actually inspectable.

## Instructions
1. List verified references for the category. Discard from consideration anything with `verified: false`.
2. Reject (with a specific reason) references that are: off-feature ("homepage only, no filter UI"), off-domain with no transferable pattern, low quality, inaccessible by design (e.g. unreadable contrast as the core idea), or matching a rejected direction.
3. Call `magec_reference_select` with feature keywords and `avoidStyles` from rejected directions. Lower `lambda` (e.g. 0.5) when results cluster in one style; it penalizes repeats and heavily used references.
4. Keep 6-12 references covering at least three approaches and two or more sources.
5. Group them into `approaches` (e.g. "sticky chip filters", "sidebar faceted filters", "full-screen mobile filter sheet"), each citing reference ids.
6. Write `insights` as feature-specific findings ("most portals show monthly installment beside price"), not generic praise.
7. Submit with `magec_task_complete`. Do not call `magec_reference_mark_used` here; usage is recorded when references inform a concept or design.

## Constraints
- Only verified references go into `referenceIds`; unverified ones may be mentioned in `summary` as unverified.
- Do not rate visual detail you have not seen; deep visual judgement belongs to the visual-analysis agent.
- Reasons for rejection must be factual and specific.

## Validation
- Every id in `referenceIds` and `approaches` exists, is verified and not rejected.
- `sourcesTried` covers every source attempted, including Mobbin as `login-required` when relevant.
- At least two approaches, or an explicit gap statement in `summary`.

## Error handling
- Fewer than four verified references: complete anyway with the gap stated, or go back to discovery once with broadened queries.
- `magec_task_complete` claim errors (unknown or unverified id): remove the id, never "fix" verification.

## Related
- `reference-discovery`, `source-deduplication` — inputs.
- `design-trend-analysis` — insights across approaches.
- `source-validation`, `structured-output` — shared rules.
