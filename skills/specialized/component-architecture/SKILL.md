---
name: component-architecture
description: Define the component inventory with purpose, anatomy, variants, states, responsive behaviour and accessibility, reusing existing Figma components when extending a file.
category: specialized
agents: [design-system-agent]
tools: [magec_artifact_read, magec_figma_status, magec_figma_read, magec_figma_snapshot, magec_memory_search, magec_decision_record, magec_message_send]
related: [design-system-planning, design-token-generation, responsive-patterns, accessibility-guidelines, figma-component-creation]
---

# Component architecture

## Purpose
Defines `DesignSystemSpec.components[]` — the contract the figma-designer turns into Figma components and
variant sets. Good architecture means few, composable components with explicit variants and states, so pages
use instances instead of detached copies.

## When to use
- In every `design-system` task after tokens exist.
- When a new feature needs a component that does not exist yet.
- When extending an existing Figma file (inventory existing components first).

## Inputs
- `planning/product-analysis.json`: features and their `states` (loading, empty, error, success, hover, focus, disabled), sitemap sections.
- Accepted concept (`concepts/*.json`) for visual direction.
- Existing components: `figma/snapshot.json` (`magec_artifact_read`) or `magec_figma_read` `{ "op": "read_components" }`.

## Outputs
Entries of `DesignSystemSpec.components`:
```json
{
  "id": "button",
  "name": "Button",
  "purpose": "Primary and secondary actions",
  "variants": ["variant=primary|secondary|ghost", "size=md|sm"],
  "states": ["default", "hover", "focus", "disabled", "loading"],
  "anatomy": ["container (auto layout row, $spacing.sm gap)", "icon (optional, leading)", "label ($type.label)"],
  "responsive": "Full width below tablet in forms; hug elsewhere",
  "accessibility": ["min 44x44 touch target", "visible 2px focus ring $color.focus", "label contrast ≥4.5:1"]
}
```

## Tool requirements
- `magec_figma_read` (`read_components`, `read_node`) — inspect existing components before defining new ones.
- `magec_figma_snapshot` — refresh the snapshot if it is missing or older than the last known Figma edit.
- `magec_message_send` — hand off component notes to `figma-designer`.

## Instructions
1. Inventory needs: walk sitemap sections and features; list recurring UI (buttons, inputs, cards, nav, tabs, badges, modals, empty/error states).
2. Inventory existing Figma components; map each need to an existing component when one fits. Reuse wins over new.
3. For each new component define: kebab-case `id` (matches `ComponentSpec.id` regex `^[a-z0-9][a-z0-9-]*$`),
   `name`, one-line `purpose`, `anatomy` parts with token refs, and auto-layout direction.
4. Express variants as properties (`variant=`, `size=`, `state=`); each combination becomes one COMPONENT and
   the set is combined into a component set. Keep combinations under ~24 per component.
5. Cover feature states: if a feature lists `empty` or `error`, a component or pattern must render it.
6. Add `responsive` behaviour and `accessibility` requirements per component (see sibling skills).
7. Prefer composition: a Card uses Button instances via `componentRef`, not its own button drawing.
8. Record notable architecture choices (e.g. "single Input with state variants") as decisions.

## Constraints
- Do not duplicate a component that already exists in the Figma file under another name; reference it.
- Do not rename existing Figma components.
- Prepare, never perform, Figma changes; you have no write tools.
- Every component must use tokens for color, spacing, radius and type.

## Validation
- Every feature state in product analysis is covered by some component state or pattern.
- No two components share the same purpose.
- Variant property names are consistent across components (`size` everywhere, not `size` and `scale`).

## Error handling
- Figma not connected while extending: use `figma/snapshot.json`; if absent, note "existing components not verified" in `layoutRules`/handoff and continue.
- Ambiguous need (component vs one-off): define it as a pattern in `layoutRules` instead.

## Related
- `figma-component-creation` — how these definitions become ComponentSpecs.
- `responsive-patterns`, `accessibility-guidelines` — fill the `responsive` and `accessibility` fields.
