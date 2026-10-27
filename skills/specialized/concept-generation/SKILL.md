---
name: concept-generation
description: Write 2-3 original, implementable and substantially different concepts with complete fields, reference citations, advantages, disadvantages and risks.
category: specialized
agents: [creative-director]
tools: [magec_artifact_read, magec_reference_list, magec_reference_select, magec_memory_search, magec_tokens_generate, magec_contrast_check, magec_assumption_record, magec_artifact_write]
related: [creative-direction, reference-synthesis, visual-storytelling, brand-expression, originality-review]
---

# Concept generation

## Purpose
Concepts give the user (or the auto-selection) a real choice. Three versions of the same idea in different colors
are not a choice. This skill writes each `Concept` so it is distinct, buildable with tokens and auto layout, grounded
in cited references, and honest about its risks.

## When to use
- Inside `creative-direction`, after synthesis and brand constraints are known.
- For new-concept or redesign workflows that must differ from a rejected one.

## Inputs
- Principles and approaches from `reference-synthesis` (with reference ids).
- Brand constraints from `brand-expression`; audiences and features from the product analysis.
- Rejected directions and task `attributes` (e.g. `premium`, `less-conventional`, `more-whitespace`).

## Outputs
Each `Concept`: `conceptId` (kebab, e.g. `quiet-courtyard`), `name`, `philosophy`, `audienceFit`, `color`,
`typography`, `layout`, `interaction`, `imagery`, `motion`, `advantages[]`, `disadvantages[]` (include risks),
`referenceIds[]`, `originalityNotes`.

## Tool requirements
- `magec_tokens_generate` / `magec_contrast_check` — sanity-check that a proposed palette can meet WCAG AA for text.
- `magec_reference_select` — find supporting references for a direction without reusing the same few.

## Instructions
1. Differ on at least three axes: layout model (editorial asymmetry vs dense grid vs immersive full-bleed), typographic voice, color strategy, imagery type, interaction density. Changing only color or font does not count.
2. `philosophy`: one or two sentences on the idea and why it fits this audience ("Calm confidence: let property photography lead, interface recedes").
3. `audienceFit`: name the audience and need it serves best, and who it serves less well.
4. Make each field specific and buildable: `color` names roles and proportions; `typography` gives classes, scale contrast and Arabic pairing; `layout` describes grid, density and key sections; `interaction` covers navigation, filters, hover/focus and feedback states.
5. `advantages` and `disadvantages`: at least one each; disadvantages include risks (performance of heavy imagery, Arabic font availability, content dependence, accessibility, build cost).
6. Cite `referenceIds` for the principles each concept uses; cite only verified references that informed it.
7. Respect `attributes` from feedback (e.g. `more-whitespace`) in every concept, while still varying the rest.
8. Check palettes with `magec_contrast_check`; adjust or note the risk.

## Constraints
- Never copy a reference's layout, composition, illustrations, copy or branding; reuse principles only.
- Never repeat a rejected direction, even partially (same layout model with new colors still counts).
- Concepts must be implementable in Figma with tokens and auto layout and must work in RTL when the product needs it.
- No concept without disadvantages.

## Validation
- 2-3 concepts that a non-designer could tell apart from their descriptions alone.
- Every concept has at least one `referenceIds` entry when verified references exist.
- Every text/background pair in proposed palettes meets AA or the risk is stated.

## Error handling
- Two concepts converge: replace the weaker one with a direction from an unused approach in the research.
- Brand constraints leave little room: vary layout, imagery and interaction instead of color, and say so.

## Related
- `creative-direction` — overall flow and submission.
- `originality-review` — checks every concept.
- `visual-storytelling` — imagery and motion fields.
