---
name: quality-standards
description: Shared definition of done for ui-ux-magec design work - accessibility, tokens, states, responsive and RTL behaviour, originality and honest verification.
category: shared
agents: []
tools: [magec_contrast_check, magec_tokens_audit, magec_design_spec_validate, magec_qa_run]
related: [structured-output, figma-context-reading, source-validation]
---

# Quality standards

## Purpose
Every agent contributes to one product: a native, editable Figma design that a team can ship. This skill sets
the common bar so analysis, concepts, systems, designs and QA are judged the same way, and so nothing is
called "done" or "passed" without evidence.

## When to use
- Before completing any task that produces design-relevant output.
- When reviewing another agent's artifact.
- When deciding whether something is good enough or needs another iteration.

## Inputs
- Accepted decisions, the selected concept and the design system.
- Project settings: languages, direction (`ltr`/`rtl`/`both`), breakpoints, themes, max QA iterations.

## Outputs
- Work that meets the checklist below, with gaps stated explicitly in limitation fields.

## Tool requirements
- `magec_contrast_check` — WCAG ratios for color pairs.
- `magec_tokens_audit` — contrast and coverage of a token set.
- `magec_design_spec_validate` — unknown tokens, missing text styles, RTL and sizing warnings.
- `magec_qa_run` — structural checks on live Figma nodes (design-qa-agent only).

## Instructions
1. **Purpose first**: every feature, section and component traces to a requirement or user need, not to
   "competitors have it".
2. **Accessibility**: text meets WCAG AA (4.5:1 body, 3:1 large text and UI). Touch targets ≥ 44×44 on mobile.
   Do not rely on color alone for state.
3. **Tokens**: colors, type, spacing and radii come from the design system; no hard-coded one-off values.
4. **States**: interactive and data components define relevant states (loading, empty, error, success, hover,
   focus, disabled).
5. **Responsive**: each designed page covers the project's breakpoints (desktop/tablet/mobile) with auto
   layout, no clipped or overflowing content.
6. **RTL and Arabic**: when direction is `rtl` or `both`, layouts mirror correctly, text aligns to the start
   side, icons with direction flip, numerals and punctuation render properly, and fonts support Arabic.
7. **Content**: no lorem ipsum in final screens; mark placeholders clearly when real content is missing.
8. **Originality**: designs are informed by references, not copied; avoid generic templates and rejected
   directions.
9. **Editability**: Figma output is native and organized (named layers, components, variants, variables).
10. **Honesty**: a check that did not run is `skipped` with a reason, never `passed`. Unverified items go in
    `limitations`/`remainingLimitations`.

## Constraints
- Do not lower the bar silently; state trade-offs.
- Visual appeal does not excuse usability or accessibility failures.
- Never claim a visual review happened without exported previews you actually inspected.

## Validation
- Contrast and token audits were run where colors were chosen.
- Spec validation reports no errors before Figma application.
- Each breakpoint and direction required by the project is accounted for.

## Error handling
- A standard cannot be met (brand color fails contrast): propose an accessible alternative as a `proposed`
  decision; do not silently change the brand.
- Tools unavailable for a check: mark it skipped and say why.

## Related
- `structured-output` — reporting skipped checks and limitations.
- `figma-context-reading` — reading live nodes for verification.
- `source-validation` — originality and reference provenance.
