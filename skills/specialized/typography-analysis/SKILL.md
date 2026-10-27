---
name: typography-analysis
description: Describe the type system visible in an inspected reference - families by class, scale, weight contrast, line length, and Arabic/RTL handling - for the analysis `typography` field.
category: specialized
agents: [visual-analysis-agent]
tools: [magec_reference_preview, magec_reference_save_analysis, magec_reference_list, magec_contrast_check, magec_artifact_read]
related: [visual-composition-analysis, color-analysis, layout-analysis, ux-pattern-analysis]
---

# Typography analysis

## Purpose
Typography carries most of a design's personality and readability. Concepts and the design system need to know how
references build hierarchy with type, and whether patterns survive Arabic script. This skill fills `typography` and
contributes to `principles`, `strengths`, `weaknesses` and `accessibility_concerns` of a `ReferenceAnalysis`.

## When to use
- For every reference inspected in a `visual-analysis` task.
- Especially for categories where type leads: heroes, editorial pages, pricing, product cards.

## Inputs
- The preview image already opened via `magec_reference_preview` + host `Read` (see `visual-composition-analysis`).
- Product languages and direction (from the task context) to judge transferability.

## Outputs
A concise `typography` string, e.g.: "Display: high-contrast serif, ~4x body size, tight leading; body: neutral
grotesque, regular, ~60-70ch lines; labels: uppercase tracked small caps; 3 levels, hierarchy by size + weight."

## Tool requirements
- `magec_reference_preview` and host `Read` — the image you are describing.
- `magec_contrast_check` — only when you can sample text and background colors reliably.

## Instructions
1. Classify families by category (geometric sans, humanist sans, grotesque, transitional serif, slab, display, script, Naskh/Kufi-style Arabic). Name a specific font only if it is identifiable with confidence or stated on the page; otherwise describe it.
2. Estimate the scale: number of distinct sizes, ratio between display and body, and where the jumps are.
3. Note weight and case contrast, letter-spacing, leading, line length and alignment.
4. For Arabic or bilingual references: how Arabic and Latin are paired, whether Arabic size is optically adjusted, alignment in RTL, numeral style, and whether the type looks like a true Arabic face or a fallback.
5. For Latin-only references in an Arabic project, state what would and would not transfer (e.g. tracked uppercase labels have no Arabic equivalent).
6. Add readability issues to `accessibility_concerns`: text over busy imagery, thin weights at small sizes, very long lines, justified Arabic with large gaps.

## Constraints
- Do not guess exact pixel sizes or font names as facts; use relative terms or mark estimates ("~").
- Describe only text visible in the inspected image.
- Do not recommend fonts here; selection belongs to brand and design-system agents.

## Validation
- `typography` covers families, scale and hierarchy in one or two sentences.
- Arabic/RTL observations present when the reference or project is Arabic.
- Font names appear only when identified with confidence; everything else is described by class.
- Readability problems seen in the image are also listed in `accessibility_concerns`.

## Error handling
- Preview resolution too low to judge type: state "low-resolution preview; only hierarchy observed" and avoid family claims.
- Mixed scripts unclear: describe what is visible and flag uncertainty in `weaknesses` or notes.
- Text is mostly inside imagery or video stills: describe the treatment, not the copy.

## Related
- `visual-composition-analysis` — inspection pipeline.
- `color-analysis` — text/background contrast.
- `ux-pattern-analysis` — typographic patterns across references.
