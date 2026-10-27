---
name: typography-selection
description: Choose type families that match the brand and support every project language, with Arabic-capable fonts whenever Arabic is in scope.
category: specialized
agents: [brand-identity-agent]
tools: [magec_project_context, magec_asset_list, magec_memory_search, magec_tokens_generate, magec_decision_record, magec_assumption_record]
related: [logo-analysis, brand-analysis, palette-generation, design-token-generation]
---

# Typography selection

## Purpose
Typography carries the brand voice and must render every language the product ships in. This skill keeps
existing brand fonts, fills gaps with well-supported families, and guarantees Arabic coverage when the project
includes Arabic, so the compiler never falls back to a font without Arabic glyphs.

## When to use
- During `brand-analysis` when the brand has no documented fonts or lacks script coverage.
- When `languages` contains `ar` or `direction` is `rtl`/`both`.
- When feedback targets "fonts", "readability" or "Arabic looks wrong".

## Inputs
- Letterform character of the logo (from `logo-analysis`).
- Fonts named in the brief or visible in brand assets (`magec_asset_list`, style guides).
- `languages` and `direction` from `magec_project_context`.
- Previous font decisions and rejections from `magec_memory_search` (`font`, `typography`).

## Outputs
- `BrandAnalysis.typography[]` entries: `family`, `usage` (e.g. "headings", "UI/body", "Arabic UI/body"),
  `source` (`extracted` | `proposed`), `supportsArabic`.
- Proposed decisions for every new family.
- Values ready for `magec_tokens_generate`: `fontFamily`, optional `headingFamily`, `arabicFamily`.

## Tool requirements
- `magec_tokens_generate` — preview the type scale (`baseFontSize`, `scaleRatio`) with the chosen families.
- `magec_decision_record` — `status: "proposed"`, topic `brand.typography.<usage>`.
- `magec_assumption_record` — when font licensing or availability is unknown.

## Instructions
1. Keep extracted fonts. If the brand font lacks Arabic, keep it for Latin and pair an Arabic family.
2. Match personality: geometric logo → geometric sans; humanist/warm → humanist sans; editorial → serif headings
   with a sans UI face. Prefer one family with weights over many families.
3. For Arabic choose families with real Arabic design and matching weights, e.g. IBM Plex Sans Arabic, Noto Sans
   Arabic, Noto Kufi Arabic, Cairo, Tajawal, Almarai, Readex Pro. Pair by x-height/stroke contrast with the Latin face.
4. Prefer families available in Figma by default (Google Fonts); flag licensed fonts as assumptions, since
   missing fonts are replaced by Inter at write time and fail QA (`missing-font`).
5. Choose `baseFontSize` (16 web, 16–17 mobile) and `scaleRatio` (1.2–1.25 for UI, up to 1.333 for expressive);
   preview with `magec_tokens_generate` and check the largest heading still fits mobile widths.
6. Note Arabic specifics in `rules`: no letter-spacing on Arabic (the compiler drops it), roughly 10% more line
   height (the `type-ar/*` text styles apply this), avoid all-caps/italic equivalents.
7. Record proposals and their rationale.

## Constraints
- If `ar` is a language, at least one family must have `supportsArabic: true`; this is mandatory.
- Never claim Arabic support you have not verified from the family's published script coverage.
- At most two families per script (heading + body) unless the brand already uses more.
- Font choice is a proposal until accepted; do not overwrite accepted typography decisions.

## Validation
- Every listed family has `usage` and `source`; Arabic projects have `supportsArabic` set on all entries.
- The generated scale contains readable body sizes (≥ 14px for secondary text, ≥ 16px body on web).
- Proposals have decision ids.

## Error handling
- Brand font unknown (only a raster logo): propose a close, available match and record the assumption.
- Availability uncertain: propose a fallback family in `rules` ("fallback: Noto Sans Arabic").

## Related
- `palette-generation` — the other half of the visual identity.
- `design-token-generation` — writes `fonts.primary/secondary/arabic` and `typography` tokens.
