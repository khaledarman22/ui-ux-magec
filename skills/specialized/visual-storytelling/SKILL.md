---
name: visual-storytelling
description: Define how each concept tells the product's story through page narrative, imagery, motion and content rhythm, in a way designers can build and content can fill.
category: specialized
agents: [creative-director]
tools: [magec_artifact_read, magec_asset_list, magec_reference_list, magec_memory_search, magec_assumption_record, magec_artifact_write]
related: [concept-generation, creative-direction, brand-expression, reference-synthesis]
---

# Visual storytelling

## Purpose
A concept is more than a palette and a font: it decides what the user sees first, what they feel, and how the page
moves them toward the primary action. This skill fills `imagery`, `motion` and the narrative parts of `layout` and
`interaction` for each concept, grounded in the product's flows and available assets.

## When to use
- For each concept during `concept-generation`.
- For section redesigns where the story of one section (e.g. hero, testimonials) is being reworked.

## Inputs
- User flows and primary actions (`planning/product-analysis.json`).
- Brand personality (`planning/brand-analysis.json`) and user assets (`magec_asset_list`).
- Imagery and motion observations from visual analyses.

## Outputs
Per concept:
- `imagery`: type (photography, illustration, 3D, typographic, data-led), subject, treatment, cropping, and the source it depends on (user assets, stock, commissioned).
- `motion`: purpose, intensity, and what moves ("staggered card reveal on scroll, 200-300 ms, reduced-motion fallback: none").
- A narrative line in `layout`: the ordered beats of the key page ("promise → proof → choice → action").

## Tool requirements
- `magec_asset_list` — check what imagery actually exists before building a concept on it.
- `magec_assumption_record` — when a concept depends on imagery the user has not supplied.

## Instructions
1. Start from the primary flow: what must the user understand in the first viewport, and what action follows?
2. Write the page as 3-6 beats; each beat maps to sitemap sections.
3. Choose imagery that serves the audience: real property photos build trust for real estate; product-on-model shots for fashion; avoid generic stock people when the product is the hero.
4. For Arabic audiences, choose culturally fitting imagery and note RTL composition (focal subject placement, gaze direction toward content).
5. Motion supports comprehension (state change, hierarchy, feedback) before delight; define a reduced-motion behaviour for each concept.
6. If imagery is not supplied, state the dependency as a risk in `disadvantages` and record an assumption.
7. Make the storytelling of each concept genuinely different (e.g. photo-led immersion vs typographic manifesto vs data-led comparison).

## Constraints
- Do not reuse a reference's imagery, illustrations or signature motion; describe an original treatment.
- Do not promise imagery or video the project cannot obtain; flag it.
- Motion must never be required to understand content.

## Validation
- Each concept has an `imagery` description and, if it uses motion, a `motion` description with a reduced-motion fallback.
- Narrative beats map to real sitemap sections.
- Asset dependencies appear in assumptions or disadvantages.

## Error handling
- No brand assets and no imagery budget known: favour typographic or illustration-light directions in at least one concept and say why.
- Feedback rejected a style of imagery: exclude it from all concepts and list it in `avoided`.

## Related
- `concept-generation` — fields this skill completes.
- `brand-expression` — personality the story must express.
