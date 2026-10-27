---
name: responsive-patterns
description: Define how layouts and components adapt across desktop, tablet and mobile and in RTL, as rules the figma-designer can express in auto layout.
category: specialized
agents: [design-system-agent]
tools: [magec_project_context, magec_artifact_read, magec_design_spec_validate, magec_figma_read, magec_decision_record]
related: [design-system-planning, component-architecture, figma-responsive-layout, figma-auto-layout]
---

# Responsive patterns

## Purpose
Figma screens are fixed-width frames per breakpoint; responsiveness is expressed as a family of screens built
from the same components with explicit rules. This skill writes those rules into `layoutRules` and component
`responsive` fields so every breakpoint is designed deliberately, not shrunk.

## When to use
- In every `design-system` task.
- When `settings.breakpoints` changes or a new breakpoint is requested.

## Inputs
- `settings.breakpoints` (default `desktop`, `mobile`) and `direction` from `magec_project_context`.
- Token `breakpoints` (default desktop 1440, tablet 834, mobile 390) and `grid`.
- Sitemap sections and component list.

## Outputs
- `layoutRules[]` such as:
  - "Desktop 1440: 12 columns, gutter 24, margin 80, content max 1280."
  - "Tablet 834: 8 columns, gutter 20, margin 32; 3-up card grids become 2-up."
  - "Mobile 390: 4 columns, gutter 16, margin 16; rows stack to columns; nav collapses to a menu button."
  - "Section padding: $spacing.3xl desktop, $spacing.2xl tablet, $spacing.xl mobile."
- `components[].responsive` per component.

## Tool requirements
- `magec_design_spec_validate` — probe that a row → column switch compiles without "fill sizing needs an auto-layout parent" warnings.
- `magec_figma_read` — inspect existing breakpoint frames when extending a file.

## Instructions
1. Cover exactly the breakpoints in settings, plus any that existing Figma screens already use.
2. For each breakpoint define columns, gutter, margin, max content width; mirror these in `tokens.grid`.
3. Define transformations in auto-layout vocabulary so they compile directly:
   `layout.direction` row → column, `width: "fill"` vs `"hug"`, `wrap: true` with `rowGap` for chip/card grids,
   hiding secondary content (separate screen spec, not visibility tricks).
4. Navigation: desktop horizontal nav; mobile menu button ≥ 44×44 plus a drawer screen/state.
5. Typography: allow one step down the scale for display/h1 on mobile; body size never shrinks below 16px.
6. Touch: interactive elements ≥ 44×44 on mobile (QA rule `touch-target`).
7. RTL: rules are written logically (start/end). The compiler mirrors `start`/`end` justify, padding left/right
   and child order of rows for `direction: "rtl"` screens; do not author separate mirrored coordinates.
8. Per component, state its behaviour: full-width, hug, stacked, scrollable horizontally, or hidden on a breakpoint.

## Constraints
- No breakpoint is "auto-scaled"; each gets explicit rules.
- Avoid absolute positioning for responsive content; it does not mirror or reflow.
- Values come from tokens (`$spacing.*`), not ad hoc numbers.

## Validation
- Every breakpoint in settings has grid + spacing + navigation rules.
- Every component has a `responsive` entry or is explicitly breakpoint-agnostic.
- Probe specs compile for each breakpoint and for RTL.

## Error handling
- Settings omit tablet but the concept depends on it: record a proposed decision and keep to settings until accepted.
- Conflicting existing breakpoint widths in Figma: reuse the existing widths and note the difference from token defaults.

## Related
- `figma-responsive-layout` — executes these rules per screen.
- `figma-auto-layout` — the layout vocabulary used here.
