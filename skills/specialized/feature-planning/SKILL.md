---
name: feature-planning
description: Detail each feature with its pages, UI states and feature-specific research categories so research and design can act on it directly.
category: specialized
agents: [product-analyst]
tools: [magec_project_context, magec_artifact_read, magec_research_sources, magec_research_plan_queries, magec_reference_list, magec_assumption_record]
related: [requirements-analysis, information-architecture, scope-prioritization, reference-discovery]
---

# Feature planning

## Purpose
The research agent derives its queries from `features[].researchCategories`, and designers derive states from
`features[].states`. This skill turns justified features into complete `Feature` entries so downstream agents
never research generic "website" ideas or forget empty and error states.

## When to use
- After `requirements-analysis`, before `information-architecture` is finalized.
- When a new feature is added through feedback.

## Inputs
- Candidate features with justifications.
- Industry, market and language from `product-discovery`.

## Outputs
Complete `Feature` objects:
- `id`, `name`, `description`, `priority`, `justification`.
- `pages[]`: sitemap slugs where the feature appears.
- `researchCategories[]`: specific kebab-case categories, e.g. `property-filters`, `property-listing-cards`, `arabic-product-cards`, `checkout-address-form`, `booking-calendar`.
- `states[]`: any of `loading`, `empty`, `error`, `success`, `hover`, `focus`, `disabled` that the feature needs.

## Tool requirements
- `magec_research_sources` — to understand what each source is good for when naming categories.
- `magec_research_plan_queries` — optional dry run to check that categories yield specific queries.
- `magec_reference_list` — reuse categories already researched in this project.

## Instructions
1. Name research categories after the UI problem, scoped to the domain: `property-filters`, not `filters`; `arabic-product-cards`, not `cards`.
2. One feature may need several categories (map search → `map-search-results`, `property-pin-preview`); several features may share one.
3. Reuse an existing category name when it means the same thing, so references are not duplicated.
4. For each feature list the states it needs: lists and search need `loading`, `empty`, `error`; forms need `error`, `success`, `disabled`, `focus`; interactive controls need `hover` and `focus`.
5. Attach `pages` after `information-architecture` defines slugs; update both until they agree.
6. Note RTL-specific needs in the description (numerals, price formats, icon mirroring) when the product is `ar` or `both`.

## Constraints
- Categories must be lowercase kebab-case and specific enough to search ("hero" alone is acceptable only for a marketing hero).
- Do not add states the feature cannot have (a static footer has no `empty` state).
- Do not change priorities here; `scope-prioritization` owns them.

## Validation
- Every `must` feature has at least one research category and at least one page.
- Every list, search or form feature lists its `empty`/`error` states as applicable.
- Every page slug referenced exists in the sitemap.

## Error handling
- Unsure whether a category is too broad: run `magec_research_plan_queries` and check whether queries read like a designer's search.
- Feature has no natural page: it is likely a cross-cutting concern; attach it to the pages where it surfaces and mention it in the description.

## Related
- `information-architecture` — owns page slugs and sections.
- `reference-discovery` — consumes the research categories.
- `scope-prioritization` — sets `priority`.
