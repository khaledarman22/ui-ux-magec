---
name: figma-component-creation
description: Build ComponentSpecs that become real Figma components and variant sets, and use them as instances in screens; reuse existing file components instead of duplicating.
category: specialized
agents: [figma-designer]
tools: [magec_task_start, magec_figma_status, magec_figma_read, magec_design_spec_validate, magec_design_spec_save, magec_figma_apply_spec, magec_figma_export_preview, magec_artifact_read]
related: [component-architecture, figma-variables, figma-frame-creation, figma-layer-organization]
---

# Figma component creation

## Purpose
Components and variants make designs consistent and editable. A `ComponentSpec` with several variants
compiles into one COMPONENT per variant combined into a component set (`combine_as_variants`). Screens then use
`INSTANCE` nodes, so a change to the component propagates everywhere.

## When to use
- `figma-foundations` tasks (after `figma-variables`).
- When a page needs a component defined in `design-system.json` that is not yet in Figma.

## Inputs
- `DesignSystemSpec.components` (variants, states, anatomy).
- Existing components: `magec_figma_read` `{ "op": "read_components" }` or `figma/snapshot.json`.

## Outputs
- Components on the `Components` page (default `ComponentSpec.page`), recorded in the `FigmaWriteReport`.
- Logical ids: variant `component/<id>/<key>`, set `componentset/<id>`.

## Tool requirements
- `magec_figma_apply_spec` with `includeComponents: true` (default) and optionally `screens: []` to write components only.
- `magec_figma_export_preview` on `componentset/<id>` for review.

## Instructions
1. Check existing components first. If the file already has a matching component, do not recreate it; reference it from screens by Figma node id (`"componentRef": "12:34"`).
2. Write one ComponentSpec per component; props become Figma variant properties:
   ```json
   { "id": "button", "name": "Button", "page": "Components", "variants": [
       { "props": { "variant": "primary", "size": "md" }, "node": { "id": "root", "name": "Button", "fill": "$color.primary", "radius": "$radius.md",
         "layout": { "direction": "row", "gap": "$spacing.sm", "padding": ["$spacing.sm", "$spacing.lg"], "justify": "center", "align": "center" },
         "children": [{ "id": "label", "type": "TEXT", "name": "label", "text": "Button", "textStyle": "$type.label", "color": "$color.on-primary" }] } },
       { "props": { "variant": "secondary", "size": "md" }, "node": { "id": "root", "fill": "$color.surface", "stroke": "$color.border", "strokeWeight": 1,
         "layout": { "direction": "row", "padding": ["$spacing.sm", "$spacing.lg"], "justify": "center", "align": "center" },
         "children": [{ "id": "label", "type": "TEXT", "name": "label", "text": "Button", "textStyle": "$type.label" }] } } ] }
   ```
3. Variant key = props sorted by name: `{variant: primary, size: md}` → logicalId `component/button/size-md-variant-primary`.
4. Instances in screens: `{ "id": "cta", "type": "INSTANCE", "name": "Hero / CTA", "componentRef": "button/size-md-variant-primary", "overrides": { "label": "Start searching" } }`.
   - `componentRef` `button/<key>` resolves to a component in the same spec; for components written by an earlier spec use the full `component/button/<key>`; `component/button` picks the set's default variant.
   - `overrides` map a TEXT layer name inside the component to new characters, so name text layers simply (`label`, `title`).
5. Cover states from the design system as a `state` prop (default, hover, focus, disabled) when they differ visually.
6. Keep component roots auto layout with hug sizing so instances resize with content.
7. Apply, export the component set preview, and inspect every variant.

## Constraints
- No detached copies of components in screens; always `INSTANCE`.
- Variant property names and values consistent across components.
- Components use tokens only (fills bind to `color/*` variables, text binds to `type/*` styles).
- Do not edit or rename user-made components; extend with new ones beside them.

## Validation
- Apply result lists every variant and the set; no "component not found" errors for instances.
- Override warnings (`override layer "x" not found`) are zero.
- Preview shows all variants legibly.

## Error handling
- `component "<ref>" not found`: wrong key or component not yet applied; apply components first or fix the ref.
- Too many variant combinations: split into separate components (e.g. IconButton) and note it.

## Related
- `component-architecture` — the definitions you implement.
- `figma-variables` — must run first so bindings resolve.
