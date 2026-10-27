---
name: visual-research
description: Gather verified visual-direction references (moodboard-level style, typography, color, imagery) across contrasting style angles for concept work.
category: specialized
agents: [research-agent]
tools: [magec_project_context, magec_artifact_read, magec_research_sources, magec_research_plan_queries, magec_research_search, magec_research_submit_candidates, magec_reference_list, magec_reference_select, magec_reference_preview]
related: [reference-discovery, design-trend-analysis, reference-evaluation, source-deduplication]
---

# Visual research

## Purpose
The creative director needs contrasting visual material to build substantially different concepts. This skill finds
verified references for look and feel - composition, type pairing, color, imagery, motion - in addition to the
functional references for each feature.

## When to use
- `research` tasks for visual categories (`hero-section`, `brand-moodboard`, `editorial-layout`).
- Redesign or new-concept workflows (`avoidRejected: true`) that need a different direction.

## Inputs
- Brand analysis (`planning/brand-analysis.json`) if available: personality, colors, established constraints.
- Audiences, market, language and direction from the product analysis.
- Rejected directions from the task context.

## Outputs
- Verified references tagged with `style` angles, previews downloaded where the page exposes one.
- Style groupings that feed the report's `approaches`.

## Tool requirements
- `magec_research_plan_queries` — pass explicit `styleAngles`.
- `magec_research_submit_candidates` — keep `downloadPreviews: true` so visual analysis can inspect images.
- `magec_reference_preview` — confirm a preview exists for key references.
- `magec_reference_select` — check that the set is diverse.

## Instructions
1. Choose 3-5 style angles that fit the brand and audience yet differ from each other, e.g. for a premium real-estate brand: "quiet luxury editorial", "architectural grid", "warm Mediterranean photography", "bold typographic".
2. Exclude angles matching rejected directions; put them in the plan's `avoid`.
3. Combine angle + feature + domain in queries: "editorial hero real estate Arabic typography", "minimal product card fashion RTL".
4. Use Behance for full case studies, Dribbble for components, Awwwards/SiteInspire/Land-book/One Page Love for production compositions, Pinterest for moodboards (verification only when robots.txt allows the pin path).
5. For Arabic or bilingual products, include at least one query targeting Arabic typography or RTL layouts.
6. After submitting, call `magec_reference_select` for the category; if the top results cluster in one style, add queries for missing angles.
7. Confirm previews for the strongest references with `magec_reference_preview`; note references without previews so visual analysis can plan around them.

## Constraints
- Never fabricate or describe images you did not retrieve.
- Do not download or store images beyond the runtime's preview cache.
- Do not let one source dominate (keep any single source under about half of the verified set).

## Validation
- At least three style angles have verified references.
- Most selected references have a `preview_path`, or the absence is explained.

## Error handling
- Pinterest pins disallowed by robots.txt: leave them unverified; use other sources for the same angle.
- Few previews available: record which references need live-page inspection in the report `summary`.

## Related
- `reference-discovery` — base pipeline.
- `design-trend-analysis` — interpreting what the visual set shows.
- `source-deduplication` — the same project across Behance and Dribbble.
