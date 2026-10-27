---
name: design-trend-analysis
description: Identify recurring patterns and current directions across verified references for a category, separating durable conventions from short-lived trends.
category: specialized
agents: [research-agent]
tools: [magec_reference_list, magec_reference_select, magec_reference_preview, magec_artifact_read, magec_artifact_write, magec_memory_search, magec_project_context]
related: [reference-evaluation, competitor-research, visual-research, reference-synthesis]
---

# Design trend analysis

## Purpose
The creative director needs to know what is conventional (users expect it), what is fashionable (may date quickly)
and what is open territory (a differentiation opportunity). This skill turns the verified set into those three
lists inside the `ResearchReport` `insights` and `approaches`.

## When to use
- At the end of a `research` task once the set is deduplicated and evaluated.
- When the user asks what is current in a domain ("what are real-estate sites doing now?").

## Inputs
- Verified, non-rejected references for the category with `style`, `source`, provenance and previews.
- Market and language (regional conventions matter: Arabic typography, RTL, local payment and trust cues).

## Outputs
- `insights[]` tagged by type, e.g. "Convention: price + monthly installment on every card (ref_a1, ref_c4, ref_f2)", "Trend: oversized serif headlines in luxury heroes (ref_b3, ref_d7)", "Gap: no reference shows filter state saved across sessions".
- Optional notes artifact `research/notes-trends-<category>.md`.

## Tool requirements
- `magec_reference_list` / `magec_reference_select` — the evidence set.
- `magec_reference_preview` — check a pattern visually before claiming it.
- `magec_artifact_write` — longer trend notes, if useful.

## Instructions
1. Count occurrences, not impressions: a pattern is a convention when it appears across most production references from different sources.
2. Call something a trend when it is frequent in recent gallery work (Dribbble, Behance, Awwwards) but rare in production sites.
3. Mark gaps: user needs from the product analysis that no reference addresses well.
4. Separate regional observations (e.g. Arabic product cards with Hindi or Western numerals, right-aligned price) from global ones.
5. Cite reference ids for every claim; claims without evidence are dropped.
6. Flag trends with usability or accessibility risks (low-contrast text on imagery, hidden navigation) so concepts can avoid them.

## Constraints
- Do not invent trend statistics ("70% of sites...") or cite external reports you did not retrieve.
- Do not base a trend on one designer or one source.
- Do not recommend copying a trend; describe it and its trade-offs.
- Do not treat rejected directions from memory as open opportunities.

## Validation
- Each convention or trend cites at least three references from at least two sources.
- Every cited id is verified and in the category.
- At least one gap or differentiation opportunity is stated, or the report says none was found.

## Error handling
- Set too small to separate trends from conventions: say so in `summary` and keep observations as insights only.
- Patterns depend on interaction you could not observe: label them as unconfirmed.
- No preview available for a key reference: base the claim on other inspected references or drop it.

## Related
- `reference-evaluation` — the set this analysis reads.
- `reference-synthesis` — how the creative director uses these findings.
