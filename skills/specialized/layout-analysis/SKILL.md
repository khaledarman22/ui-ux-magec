---
name: layout-analysis
description: Record the grid, spacing rhythm, section structure, navigation and component arrangement visible in an inspected reference, including what it implies for RTL and smaller screens.
category: specialized
agents: [visual-analysis-agent]
tools: [magec_reference_preview, magec_reference_save_analysis, magec_reference_list, magec_reference_select, magec_artifact_read]
related: [visual-composition-analysis, typography-analysis, ux-pattern-analysis]
---

# Layout analysis

## Purpose
Designers and the design system turn references into grids, spacing scales and component layouts. This skill fills
the structural fields of a `ReferenceAnalysis` - `layout_structure`, `grid`, `spacing`, `components`, `navigation`,
`responsive_notes`, `layout_label` - with observations precise enough to reason about, never measurements invented.

## When to use
- For every reference inspected in a `visual-analysis` task.
- In depth for structural categories: filters, listings, dashboards, checkout, navigation.

## Inputs
- The inspected preview (via `magec_reference_preview` + host `Read`) or live page.
- Feature context from the research report (what this category must do).

## Outputs
- `layout_structure`: "Two-column: 280px-ish sticky filter sidebar left, 3-column card grid right, sort bar above results."
- `grid`: "12-column, wide gutters, content max-width ~1200, cards span 4 columns."
- `spacing`: "Generous 8-based rhythm; section gaps ~2x card gaps; dense inside cards."
- `components[]`: e.g. `["filter-chip", "range-slider", "listing-card", "pagination", "sort-dropdown"]`.
- `navigation`, `responsive_notes`, `layout_label` (short kebab label, e.g. `sidebar-filters-grid`).

## Tool requirements
- `magec_reference_preview` + host `Read` — the image being described.
- `magec_reference_save_analysis` — store fields with the rest of the analysis.

## Instructions
1. Identify the macro structure first (single column, split, sidebar + content, bento, masonry, full-bleed sections), then the grid inside it.
2. Count columns and estimate proportions; mark estimates with "~". Note max content width relative to the viewport.
3. Describe spacing as a rhythm (tight/regular/generous, consistent or not) and the relation between inner and outer spacing.
4. List components with consistent kebab names so patterns can be counted across references.
5. Record navigation type (top bar, mega menu, sidebar, bottom tabs, hamburger) and where primary actions sit.
6. RTL: state which elements must mirror (sidebar side, chevrons, progress direction) and which must not (media controls, logos, phone numbers).
7. `responsive_notes` only from evidence: a mobile shot, a responsive preview, or explicit layout cues. Otherwise write "desktop view only; mobile not inspected".

## Constraints
- No invented pixel values, breakpoints or column counts presented as fact.
- Do not describe parts of the page below the inspected viewport.
- Keep component names generic; do not use the reference's proprietary product names.

## Validation
- `layout_structure` and `components` are filled for every analysis.
- `responsive_notes` states its evidence or says not inspected.
- `layout_label` is short kebab-case and reusable across references.

## Error handling
- Preview is a cropped Dribbble shot of one component: analyse the component layout only and say the page layout is unknown.
- Layout ambiguous (overlapping art direction): describe the visible zones and flag uncertainty.

## Related
- `visual-composition-analysis` — inspection and scores.
- `ux-pattern-analysis` — patterns across layouts.
