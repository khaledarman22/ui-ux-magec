---
name: icon-sourcing
description: Fetch a consistent set of open-source icons (Lucide, Tabler, Phosphor) as sanitized, editable SVG into assets/icons.
category: specialized
agents: [asset-agent]
tools: [magec_asset_strategy, magec_icon_get, magec_asset_library]
related: [asset-planning, figma-asset-management, component-architecture]
---

# Icon sourcing

## Purpose
Icons from one open-source family, stored as SVG so the designer places them as editable vectors tinted with
color tokens.

## When to use
- Icon slots from `asset-planning` (features, navigation, social, form fields, status).

## Inputs
- Slot list; the set already used in the library (if any).

## Outputs
- `assets/icons/<set>-<name>.svg` files in the asset library (license recorded).

## Tool requirements
- `magec_icon_get` — `{ set: "lucide" | "tabler" | "phosphor", names: [...] }`; returns `icons` and `missing`.

## Instructions
1. Use one set for the whole project; default `lucide`, otherwise keep the set already in the library.
2. Use the set's real icon names (Lucide: `arrow-right`, `chart-line`, `shield-check`, `mail`, `map-pin`...).
3. Request all names for the page in one call; for `missing` names try the set's synonym (e.g. `bar-chart-3`).
4. Directional icons (arrows, chevrons) will be mirrored for RTL by the designer; note them in the report.

## Constraints
- Do not mix sets on one page; do not draw icons by hand when the set has one.

## Validation
- Every icon slot maps to a library record with `origin: icon-set`.

## Error handling
- Network failure: retry once; then list the slots in `unresolved`.

## Related
- `asset-planning`, `figma-asset-management`.
