---
name: competitor-research
description: Find and verify live production and competitor sites for a feature, recording how real products solve it rather than how concept shots imagine it.
category: specialized
agents: [research-agent]
tools: [magec_artifact_read, magec_research_sources, magec_research_plan_queries, magec_research_search, magec_research_submit_candidates, magec_reference_list, magec_reference_reject, magec_memory_search]
related: [reference-discovery, reference-evaluation, design-trend-analysis, source-validation]
---

# Competitor research

## Purpose
Gallery shots show what looks good; production sites show what survives real content, real data and real users.
This skill adds verified production references (source `web`) to each category so concepts are grounded in
working patterns, especially for complex features such as filters, checkout and listing detail.

## When to use
- Every `research` task for a functional category (filters, search, cards, forms, checkout, dashboards).
- When the brief names competitors or the user asks "how do others do it?".

## Inputs
- Industry and `market` from `planning/product-analysis.json`; competitors named in the brief.
- The category and its feature (e.g. `property-filters` for feature `property-search`).

## Outputs
- Verified references from production sites with `category`, `style`, provider and query provenance.
- Competitor notes for the report's `insights` and `approaches` (pattern names with reference ids).

## Tool requirements
- `magec_research_search` or the host web search — find production URLs.
- `magec_research_submit_candidates` — verify by retrieval (robots.txt respected).
- `magec_reference_reject` — drop pages that turned out irrelevant (with reason).

## Instructions
1. Collect competitors from the brief first, then search for market leaders: "best real estate portals Egypt", "Arabic fashion e-commerce sites", "Saudi grocery delivery website".
2. Prefer the exact page that shows the feature (the search results page with filters open, the product listing page), not the homepage.
3. Include regional and global examples: a local leader shows market conventions (Arabic content, RTL, local payment), a global leader shows mature patterns.
4. Use Awwwards site pages to discover production sites, then submit the live production URL as its own candidate.
5. Submit each URL with `provider` set to where you found it and the exact `query`.
6. Note concrete observations only from what retrieval or inspection showed (e.g. "filters in a sticky top bar with chips"). Leave visual detail to the visual-analysis agent.
7. Reject candidates that are login walls, parked domains or unrelated pages with `magec_reference_reject`.

## Constraints
- Do not log in or create accounts to see features; gated features are reported as not inspectable.
- Do not claim market share, traffic or business metrics.
- Do not copy competitor copy, branding or proprietary assets into notes beyond what is needed to describe the pattern.
- A competitor's pattern is evidence, not a requirement; never present "competitors have it" as a justification.

## Validation
- Each functional category has at least two verified production references when they exist publicly.
- Every competitor named by the user was attempted and appears in `sourcesTried` or `insights` with its outcome.

## Error handling
- Site blocks automated retrieval: record `blocked`, keep the reference unverified, do not work around it.
- Feature only visible after interaction (e.g. a filter drawer): record the page as verified but note the limitation for visual analysis.

## Related
- `reference-discovery` — query and submission rules.
- `reference-evaluation` — keep or reject.
- `design-trend-analysis` — patterns across competitors.
