---
name: figma-auto-layout
description: Express every layout as DesignNode auto layout (direction, gap, padding, justify, align, wrap, fill/hug sizing) using tokens, so Figma output stays editable and mirrors correctly in RTL.
category: specialized
agents: [figma-designer]
tools: [magec_design_spec_validate, magec_design_spec_save, magec_figma_apply_spec, magec_figma_read, magec_figma_export_preview, magec_artifact_read]
related: [figma-frame-creation, figma-responsive-layout, figma-component-creation, responsive-patterns]
---

# Figma auto layout

## Purpose
Auto layout is what makes a Figma design editable and resizable. The spec language describes it logically
(`layout`, `width: "fill"|"hug"|number`); the compiler turns it into Figma auto layout, resolves token refs,
and mirrors start/end, left/right padding and row order for RTL screens.

**Auto layout is mandatory and enforced.** The compiler rejects a spec when:
- a frame or component has children but no `layout`;
- a child inside auto layout has `x`/`y` (only `absolute: true` overlays may be positioned);
- sibling frames repeat the same structure (cards, list items, stats, nav items...) instead of being instances
  of one component.

QA re-checks the same rules on the nodes read back from Figma (`auto-layout`, `repeated-structure`).

## When to use
- Every section, row, card, list and form you author.
- When QA reports `auto-layout`, `repeated-structure`, `clipping`, `overflow`, `spacing-scale` or `rtl-alignment` issues.

## Inputs
- Tokens (`$spacing.*`, `$radius.*`, `$color.*`, `$type.*`) from the design system.
- Layout and responsive rules (`layoutRules`, component `responsive`).

## Outputs
- DesignNodes with `layout` blocks that compile without warnings.

## Tool requirements
- `magec_design_spec_validate` — rejects frames with children but no layout, x/y inside auto layout, and repeated sibling structures; warns on `"fill"` without an auto-layout parent.
- `magec_figma_read` `read_node` — inspect existing auto-layout settings when matching an existing file.

## Instructions
1. Every container FRAME with children gets `layout`. Field reference:
   - `direction`: `row` | `column` → HORIZONTAL | VERTICAL.
   - `gap`, `rowGap` (wrap only), `padding`: number or token; padding is 1, 2 (`[vertical, horizontal]`) or 4 values (`[top, right, bottom, left]`).
   - `justify`: `start|center|end|space-between` (main axis); `align`: `start|center|end|baseline` (cross axis).
   - `wrap: true` for chip rows and card grids.
2. Children size with `width`/`height`: `"fill"` (needs an auto-layout parent), `"hug"`, or a number (fixed).
3. Anything that repeats on a page is a **page-level component** with auto layout, placed with instances.
   Define it in the same spec's `components` with `page` set to the screen's page (it is placed beside the
   screens), then use `INSTANCE` nodes with `overrides` (keyed by the child layer name):
   ```json
   { "components": [
       { "id": "listing-card", "name": "Listing Card", "page": "Listings", "variants": [ { "props": {}, "node":
         { "id": "root", "width": 384, "radius": "$radius.md", "fill": "$color.surface",
           "layout": { "direction": "column", "gap": "$spacing.sm", "padding": "$spacing.md" },
           "children": [
             { "id": "photo", "name": "Photo", "width": "fill", "height": 220, "clip": true, "image": "assets/images/apartment-living-room.jpg" },
             { "id": "price", "type": "TEXT", "name": "Price", "text": "SAR 4,200 / month", "textStyle": "$type.h4", "width": "fill" },
             { "id": "meta", "type": "TEXT", "name": "Meta", "text": "3 bd · 2 ba · 140 m²", "textStyle": "$type.body-sm", "color": "$color.text-muted", "width": "fill", "maxLines": 1 }
           ] } } ] } ],
     "screens": [ { "id": "listings-desktop", "name": "Listings", "page": "Listings", "breakpoint": "desktop", "sections": [
       { "id": "grid", "name": "Listings / Grid", "layout": { "direction": "row", "gap": "$spacing.lg", "wrap": true, "rowGap": "$spacing.lg" },
         "children": [
           { "id": "card-1", "type": "INSTANCE", "componentRef": "listing-card", "overrides": { "Price": "SAR 4,200 / month" } },
           { "id": "card-2", "type": "INSTANCE", "componentRef": "listing-card", "overrides": { "Price": "SAR 3,650 / month" } }
         ] } ] } ] }
   ```
   Design-system components (buttons, inputs...) come from the foundations; page components are for patterns
   specific to the page.
4. Text inside auto layout: use `width: "fill"` for wrapping paragraphs (auto-resize HEIGHT), omit width for single labels (WIDTH_AND_HEIGHT), `maxLines` for truncation.
5. Use `align: "start"` and `justify: "start"` logically; do not hand-mirror for RTL. The compiler flips them and reverses row children for `direction: "rtl"` screens.
6. Use `absolute: true` only for overlays (badges on images, decorative shapes); they do not reflow or mirror.
7. Use `clip: true` on image containers and cards with rounded corners; avoid clipping text containers.
8. Use spacing tokens only; QA flags gaps/padding off the scale.

## Constraints
- No groups or free-positioned children for layout; no spacer rectangles (use `gap`/`padding`).
- No copy-pasted structures: one component, many instances.
- No nested frame without purpose; each level should be a meaningful unit (row, card, stack).
- Never set fixed heights on text containers that hold variable copy.

## Validation
- Spec validates with no sizing warnings.
- Preview shows no clipped or overflowing text; RTL preview shows mirrored order.
- `magec_figma_read` `read_node` on a section shows `layoutMode` set and token-valued spacing.

## Error handling
- `repeated-structure` from validation or QA: extract the repeated frame into a page component and replace the copies with instances.
- Overflow after apply: switch fixed widths to `"fill"`, enable `wrap`, or reduce content per row; re-apply (idempotent).
- Baseline alignment mismatch between scripts: use `center` instead of `baseline` for mixed Arabic/Latin rows.

## Related
- `figma-frame-creation`, `figma-responsive-layout`, `responsive-patterns`.
