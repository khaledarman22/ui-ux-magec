---
name: information-architecture
description: Build the sitemap - pages, hierarchy, sections and the features each section serves - so every designed page has a clear purpose and nothing is orphaned.
category: specialized
agents: [product-analyst]
tools: [magec_project_context, magec_artifact_read, magec_memory_search, magec_assumption_record, magec_artifact_write]
related: [feature-planning, user-flow-design, scope-prioritization, requirements-analysis]
---

# Information architecture

## Purpose
The sitemap decides which Figma pages get designed: the pipeline creates one page-design and one QA task for every
sitemap page with priority `must` or `should`. Sections become the units users give feedback on ("the hero", "the
filters"). A clear IA keeps design, feedback scoping and QA aligned.

## When to use
- Inside `product-analysis`, after features are listed.
- When feedback adds or removes pages or sections.

## Inputs
- Features (with `pages` drafts) and roles.
- Product type and languages (RTL affects navigation order, not hierarchy).

## Outputs
`sitemap[]` of `SitemapPage`:
- `slug` (kebab-case), `name`, `purpose` (one sentence: what the user achieves here), `parent` (slug, optional), `priority`.
- `sections[]` with `id`, `name`, `purpose`, `featureIds[]`.

## Tool requirements
- `magec_artifact_read` — brief and existing analysis when revising.
- `magec_assumption_record` — pages added because the product type implies them (e.g. `login`).

## Instructions
1. Start from the primary task of each role and the minimum pages needed to complete it; add supporting pages (about, contact, legal) only when justified.
2. Give each page a single purpose. If the purpose needs "and", consider splitting.
3. Define sections top to bottom in reading order. Use stable ids that feedback can reference: `hero`, `search`, `filters`, `results`, `listing-cards`, `map`, `pricing`, `faq`, `footer`.
4. Link each section to the feature ids it serves; purely structural sections (`header`, `footer`) may have none.
5. Set page `priority` from the highest-priority feature it hosts (a page hosting a `must` feature is `must`). `could` pages are not designed by default.
6. Use `parent` for real hierarchy only (e.g. `property-detail` under `listings`); do not nest for decoration.
7. Make the feature `pages` lists and the sitemap agree.

## Constraints
- Slugs must match `^[a-z0-9][a-z0-9-]*$`; section ids lowercase kebab-case and unique within a page.
- No page without a purpose; no `must` feature without a page.
- Keep the IA language-neutral: names may be English, but do not create separate pages per language; bilingual is handled by `direction: both`.

## Validation
- Every `must` feature id appears in at least one section's `featureIds`.
- Every section `featureIds` entry exists in `features`.
- Total designed pages (must + should) are realistic for the scope; flag in `notes` if more than about ten.

## Error handling
- A feature fits no page: either create a page with a stated purpose or mark the feature `could` and explain.
- Revising an IA that is already designed: do not rename existing slugs; add new pages or sections instead and note the change.

## Related
- `feature-planning` — feature-to-page mapping.
- `user-flow-design` — flows must be possible through this sitemap.
- `scope-prioritization` — page priority follows feature priority.
