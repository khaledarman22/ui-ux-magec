---
name: design-token-generation
description: Generate the DesignTokens set (colors, themes, typography, spacing, radius, shadow, breakpoints, grid, fonts) from the accepted brand and concept, audited for WCAG AA.
category: specialized
agents: [design-system-agent]
tools: [magec_artifact_read, magec_memory_search, magec_tokens_generate, magec_tokens_audit, magec_contrast_check, magec_figma_read, magec_decision_record, magec_project_context, magec_design_spec_validate]
related: [design-system-planning, palette-generation, typography-selection, accessibility-guidelines, figma-variables]
---

# Design token generation

## Purpose
Tokens are the single source of values for every spec the figma-designer writes (`$color.primary`,
`$spacing.lg`, `$type.h1`) and for the Figma variables and text styles synced from them. This skill produces
`DesignSystemSpec.tokens` that compiles cleanly, matches the brand, and passes AA.

## When to use
- In every `design-system` task, before components are defined.
- When an accepted decision changes a brand color, font or density.

## Inputs
- `planning/brand-analysis.json` (colors, typography, rules) and the accepted concept (`concepts/*.json`).
- `settings.themes` and `settings.breakpoints` from `magec_project_context`.
- Existing Figma variables/styles when extending a file: `magec_figma_read` with `{ "op": "read_variables" }` and `{ "op": "read_styles" }`.

## Outputs
`tokens` matching `DesignTokensSchema` (`packages/schemas/src/design.ts`):
```json
{
  "color": { "primary": "#0E5A8A", "on-primary": "#FFFFFF", "background": "#FFFFFF", "surface": "#F5F7F9",
             "text": "#14212B", "text-muted": "#4A5A66", "border": "#D5DDE3", "error": "#B3261E" },
  "themes": { "dark": { "background": "#0F171D", "surface": "#18232B", "text": "#E8EEF2" } },
  "typography": { "h1": { "fontFamily": "IBM Plex Sans", "fontStyle": "SemiBold", "fontSize": 48, "lineHeight": 56 },
                  "body": { "fontFamily": "IBM Plex Sans", "fontStyle": "Regular", "fontSize": 16, "lineHeight": 24 } },
  "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32, "2xl": 48, "3xl": 64 },
  "radius": { "sm": 4, "md": 8, "full": 999 },
  "breakpoints": { "desktop": 1440, "tablet": 834, "mobile": 390 },
  "grid": { "desktop": { "columns": 12, "gutter": 24, "margin": 80 }, "mobile": { "columns": 4, "gutter": 16, "margin": 16 } },
  "fonts": { "primary": "IBM Plex Sans", "arabic": "IBM Plex Sans Arabic" }
}
```

## Tool requirements
- `magec_tokens_generate` — deterministic starting set from `primary`, `secondary`, `neutralBase`, `background`,
  `fontFamily`, `headingFamily`, `arabicFamily`, `baseFontSize`, `scaleRatio`, `spacingBase`, `dark`.
- `magec_tokens_audit` — contrast/coverage audit of the final set.
- `magec_contrast_check` — specific pairs (e.g. `on-primary` on `primary`).

## Instructions
1. Generate a base set with `magec_tokens_generate` using accepted brand values only (proposed-but-unaccepted values only if the task says so).
2. Name tokens semantically and in lowercase kebab-case (`text-muted`, not `grey-600`): names become `color/<name>`
   variables and `$color.<name>` refs, which must match `^\$[a-z][a-z0-9]*\.[a-z0-9._-]+$`.
3. Ensure the roles specs depend on exist: `background` (screen default), `text` (TEXT default), `surface`,
   `border`, `primary`, `on-primary`, feedback colors.
4. Themes: put only overriding colors in `themes.<mode>`; keys must also exist in `color`.
5. Typography: one key per role (`display`, `h1`–`h4`, `body`, `body-sm`, `label`, `caption`); `fontStyle` must be a
   real style name of the family ("SemiBold", not "600").
6. Spacing on a 4/8 base; QA flags auto-layout gaps/padding off this scale (`spacing-scale`).
7. Breakpoints and grids only for breakpoints in project settings (plus defaults).
8. Set `fonts.arabic` whenever Arabic is a language; otherwise Arabic text compiles with a warning.
9. When extending an existing Figma file, reuse existing variable names and values; add, do not rename.
10. Run `magec_tokens_audit`; fix every failure or document a restriction in `accessibilityRules`.

## Constraints
- No raw values that are not in the brand analysis or derived from it.
- Do not write variables to Figma; `figma-variables` (figma-designer) syncs them.
- Do not rename tokens already used by saved specs without listing the affected specs in the handoff.

## Validation
- `magec_tokens_audit` passes; `magec_design_spec_validate` on a small sample spec resolves `$color.text`, `$type.body`, `$spacing.md`.
- Every theme key exists in base `color`.

## Error handling
- Audit failure on a brand color: introduce a darker text-safe sibling token (`primary-strong`) rather than changing the brand color.
- Font style missing in family: pick the nearest existing style and note it.

## Related
- `design-system-planning` — assembles tokens into the full `DesignSystemSpec`.
- `figma-variables` — turns these tokens into Figma variables and text styles.
