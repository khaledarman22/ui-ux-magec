---
name: figma-layer-organization
description: Keep Figma pages, frames and layers meaningfully named and structured so files are navigable, QA-clean and safe to extend.
category: specialized
agents: [figma-designer]
tools: [magec_figma_read, magec_figma_snapshot, magec_design_spec_validate, magec_figma_apply_spec, magec_figma_update_nodes, magec_artifact_read]
related: [figma-frame-creation, figma-component-creation, figma-node-editing, design-validation]
---

# Figma layer organization

## Purpose
Developers and designers judge a file by its layers panel. Meaningful names and a predictable page structure
make designs reusable and let QA's `layer-naming` and `empty-frame` rules pass. Organization also decides
where new work goes in an existing file without disturbing what is there.

## When to use
- Authoring any spec (names are part of the spec).
- Extending an existing file (choose pages and placement).
- When QA reports `layer-naming` or `empty-frame` issues.

## Inputs
- Sitemap pages from `planning/product-analysis.json`.
- Existing pages and frames: `magec_figma_read` `{ "op": "read_document", "includeFrames": true }` or `figma/snapshot.json`.
- Project mode (`new` / `existing`) and `existingDesignMode` (`audit` | `suggest` | `extend`).

## Outputs
- Spec `name` fields on every node; pages set via `ScreenSpec.page` / `ComponentSpec.page`.

## Tool requirements
- `magec_figma_read` / `magec_figma_snapshot` — current structure before writing.
- `magec_figma_update_nodes` (`patch.name`) — rename owned nodes flagged by QA.

## Instructions
1. Pages: one Figma page per sitemap page (`"Home"`, `"Listing Details"`), plus `"Components"` for component sets.
   Pages are created on demand by apply. Use `pageSuffix` (e.g. `"Proposal"` → `"Home — Proposal"`) when suggesting changes to an existing page in extend/suggest mode.
2. Screen frames are named automatically `"<name> — <breakpoint>"` with `" (RTL)"`; give `ScreenSpec.name` the human page name.
3. Layer names: `Section / Element` pattern in title case — `"Hero"`, `"Hero / Title"`, `"Hero / CTA"`, `"Pricing / Plan Card"`. If omitted, the name falls back to the node `id`, so pick ids that read well too.
4. Never leave Figma defaults (`Frame 12`, `Rectangle`, `Text`, `Group 3`); QA flags them.
5. Text layers inside components get short stable names (`label`, `title`) because instance `overrides` target them by name.
6. Remove purposeless wrappers; a frame with no children and no fill is flagged `empty-frame`.
7. Order sections in reading order; the compiler handles RTL reversal for rows.
8. Existing files: put new frames on the matching page to the right of existing frames (explicit `x`), or on a suffixed page; never move, rename or regroup user layers.
9. Mark placeholders in the name and with `placeholder: true`.

## Constraints
- Rename only nodes this project owns (in `figma/mappings.json`).
- Names describe purpose, not appearance (`"Primary CTA"`, not `"Blue Button"`).
- Do not encode state in layer names of screens; states are component variants.

## Validation
- QA `layer-naming` passes for written screens.
- Every page in the sitemap that has designs has a matching Figma page.
- No new frames overlap existing ones (check bounds in `read_document`).

## Error handling
- Rename refused with conflict: the user edited the node; leave it and note it, or follow the approval path in `figma-node-editing`.
- Page name collides with a user page of different purpose: use `pageSuffix` and note it.

## Related
- `figma-frame-creation`, `figma-component-creation`, `figma-node-editing`.
