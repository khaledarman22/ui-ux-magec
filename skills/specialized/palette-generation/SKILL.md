---
name: palette-generation
description: Extend extracted brand colors into a complete, accessible digital palette (roles, neutrals, feedback colors, optional dark theme) proposed for approval.
category: specialized
agents: [brand-identity-agent]
tools: [magec_tokens_generate, magec_tokens_audit, magec_contrast_check, magec_decision_record, magec_memory_search, magec_project_context, magec_artifact_write]
related: [logo-analysis, brand-analysis, typography-selection, design-token-generation]
---

# Palette generation

## Purpose
Digital products need more colors than a logo has: surfaces, text, borders, states, success/warning/error.
This skill derives them from the brand colors so the product still looks like the brand, and proves every
text/background pairing meets WCAG AA before anything is proposed.

## When to use
- During `brand-analysis` after `logo-analysis` has extracted colors.
- When the brand has only one or two colors, or no colors at all.
- When `settings.themes` includes `dark` and a dark palette is needed.

## Inputs
- Extracted colors and roles (from `logo-analysis`).
- Personality traits and audience (from `brand-analysis`).
- `settings.themes` from `magec_project_context`.
- Rejected directions from `magec_memory_search` (`color`, `palette`) — never re-propose them.

## Outputs
- Color entries for `BrandAnalysis.colors` with roles such as `primary`, `secondary`, `accent`, `background`,
  `surface`, `text`, `text-muted`, `border`, `success`, `warning`, `error`; new ones `source: "proposed"`.
- One `proposed` decision per new color group, with the audit results in the rationale.

## Tool requirements
- `magec_tokens_generate` — deterministic ramps with WCAG-safe text colors from `primary`, `secondary`,
  `neutralBase`, `background` (set `dark: true` for a dark theme). Nothing is saved; use it to explore.
- `magec_tokens_audit` — contrast and coverage audit of the generated set.
- `magec_contrast_check` — exact ratios for specific pairs (pass `fontSize`/`fontStyle` for large text).

## Instructions
1. Fix the anchors: the extracted primary (and secondary) stay exactly as extracted.
2. Choose `neutralBase` tinted toward the primary hue (low saturation) so greys feel related to the brand.
3. Call `magec_tokens_generate` with the anchors and a placeholder `fontFamily`; inspect the color part of the result.
4. If the primary fails as a text or button color on white (< 4.5:1 normal text, < 3:1 for large text and UI
   boundaries), keep it for large surfaces and fills, and propose a darker shade for text/links. Never alter the anchor itself.
5. Pick feedback colors (success/warning/error) that do not collide with brand hues; check each against the
   background and against white text.
6. If dark theme is required, regenerate with `dark: true` and check the same pairs on dark surfaces.
7. Run `magec_tokens_audit` on the final set and `magec_contrast_check` on every intended pair
   (text/background, text-muted/surface, button-label/primary, border/background).
8. Record proposals with `magec_decision_record` (`status: "proposed"`, rationale includes ratios).

## Constraints
- Extracted colors are immutable; derived colors are proposals.
- AA is the floor: 4.5:1 normal text, 3:1 large text (≥ 24px, or ≥ 18.66px bold) and non-text UI.
- Keep the palette small: one accent at most beyond primary/secondary unless the brand already has more.
- Do not save tokens here; `design-token-generation` (design-system-agent) owns `design-system/design-system.json`.

## Validation
- Every role used for text has a measured ratio ≥ its AA requirement on its intended background.
- `magec_tokens_audit` reports no contrast failures for the proposed pairs, or failures are explained and restricted (e.g. "accent never used for text").
- Dark palette (if any) passes the same checks.

## Error handling
- Anchor color cannot reach AA on any background as text: restrict it to non-text use and say so in `rules`.
- Generated ramp looks off-brand: adjust `neutralBase`/`secondary` and regenerate; do not hand-tweak to untested values.

## Related
- `logo-analysis` — source of anchors.
- `design-token-generation` — turns the accepted palette into tokens.
- `accessibility-guidelines` — system-wide contrast rules.
