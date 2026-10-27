---
name: brand-expression
description: Translate the brand analysis into concept-level expression - what is fixed, what each concept may vary, and how personality shows up in color, type, imagery and tone.
category: specialized
agents: [creative-director]
tools: [magec_artifact_read, magec_asset_list, magec_memory_search, magec_tokens_generate, magec_tokens_audit, magec_contrast_check, magec_decision_record, magec_assumption_record]
related: [creative-direction, concept-generation, visual-storytelling, originality-review]
---

# Brand expression

## Purpose
Concepts must look like this brand, not like the references. The brand-identity agent defines colors, typography and
personality (`BrandAnalysis`); this skill decides how each concept expresses them, keeping established identity
intact and treating proposed elements as open.

## When to use
- Inside `concept-generation`, before writing concepts.
- When feedback targets brand feel ("make it feel more premium", "اجعله أفخم").

## Inputs
- `planning/brand-analysis.json`: `established`, `personality`, `colors` (`hex`, `role`, `source` extracted/proposed), `typography` (`family`, `usage`, `source`, `supportsArabic`), `rules`, `constraints`, `proposedDecisions`.
- Accepted brand decisions in memory; task `params.preserveExistingIdentity` for audits.

## Outputs
- A fixed/open split used by every concept, e.g. "Fixed: logo navy #1D2A44 as primary; Arabic-capable sans for UI. Open: accent, display face, imagery style."
- Concept fields (`color`, `typography`, `philosophy`) that express the personality traits explicitly.

## Tool requirements
- `magec_tokens_generate` — derive ramps from the fixed brand colors to test a concept's palette.
- `magec_tokens_audit`, `magec_contrast_check` — accessibility of brand-based palettes.
- `magec_decision_record` — record a brand interpretation as `proposed` when it extends the brand.

## Instructions
1. If `established` is true, every `extracted` color and font with a usage rule is fixed; concepts vary around them.
2. If the brand was proposed (no assets), concepts may vary palette and type, but each must state which proposed elements it keeps or replaces.
3. Map each personality trait to concrete choices per concept ("trustworthy" → restrained palette, clear hierarchy, real photography; "modern" → generous whitespace, geometric sans).
4. Fonts must support Arabic when the product is `ar` or `both`; use `supportsArabic` and record an assumption if unknown.
5. Test palettes derived from fixed colors with `magec_tokens_generate` / `magec_contrast_check`; if the brand primary fails as text color, use it for surfaces and accents and say so.
6. When feedback asks for a brand feel change, apply it within the fixed constraints first; propose constraint changes as `proposed` decisions for the user.

## Constraints
- Never alter or recolor an established logo or replace extracted brand colors in a concept.
- Do not import a reference's brand traits (signature colors, logotype style, mascots).
- Brand extensions are proposals until the user accepts them.
- For scoped redesigns, do not change project-wide brand expression; vary only inside the scope.

## Validation
- Every concept states how it uses each fixed brand element.
- Arabic font support confirmed or recorded as an assumption.
- Brand-based text colors meet AA or the risk is listed in disadvantages.

## Error handling
- Brand analysis missing: record an assumption, keep concepts brand-neutral on fixed elements, and flag it in `notes`.
- Brand rules conflict with accessibility: keep accessibility, propose the adjustment as a decision.
- Feedback contradicts the established brand: explain the conflict to the orchestrator via the task `notes` instead of silently breaking the brand.

## Related
- `creative-direction`, `concept-generation` — where the split is applied.
- `visual-storytelling` — personality in imagery and motion.
