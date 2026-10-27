---
name: color-analysis
description: Describe palette structure, color roles, contrast and mood in an inspected reference, checking contrast with sampled values where possible and flagging accessibility risks.
category: specialized
agents: [visual-analysis-agent]
tools: [magec_reference_preview, magec_reference_save_analysis, magec_contrast_check, magec_tokens_audit, magec_reference_list, magec_artifact_read]
related: [visual-composition-analysis, typography-analysis, ux-pattern-analysis]
---

# Color analysis

## Purpose
Color direction is one of the main levers that separate concepts. This skill fills the `color` field and the
color-related `accessibility_concerns`, `strengths` and `principles` of a `ReferenceAnalysis`, describing how color
is used (roles, proportions, contrast), not only which hues appear.

## When to use
- For every reference inspected in a `visual-analysis` task.
- When the creative director needs palette evidence for a concept direction.

## Inputs
- The inspected preview image (via `magec_reference_preview` + host `Read`).
- Brand constraints from the task context, to note compatibility.

## Outputs
A `color` string, e.g.: "Warm off-white base (~80%), deep olive for text and nav, single terracotta accent reserved
for primary CTAs and price; photography supplies most saturation; low-saturation, calm mood."

## Tool requirements
- `magec_contrast_check` — WCAG ratios for estimated text/background pairs.
- `magec_tokens_audit` — optional, when describing a reference palette as a small token set for comparison.

## Instructions
1. Identify the base (background), surface, text, accent and semantic colors, and their approximate proportions.
2. Describe hues by name and approximate hex only when sampled from a flat area; mark values as approximate ("~#2F3A2B").
3. State the accent strategy: single accent, multi-accent, gradient, color-coded categories.
4. Note mode (light, dark, mixed) and how imagery contributes color.
5. For text over flat color, run `magec_contrast_check` on estimated pairs and record failures in `accessibility_concerns` with "estimated from preview".
6. Flag risks: meaning carried by color alone, low-contrast placeholder text, text on photos without overlay, red/green-only status.
7. Write a transferable principle ("accent reserved for one action per view") rather than the palette itself.

## Constraints
- JPEG compression and screenshots shift colors; never present sampled values as exact brand colors.
- Do not judge contrast for text over imagery numerically; describe it qualitatively.
- Do not recommend a palette for the project; that is the brand and design-system agents' work.

## Validation
- `color` describes roles and proportions, not just a list of hues.
- Every numeric contrast claim comes from `magec_contrast_check` and is labelled estimated.
- Color-related accessibility concerns are in `accessibility_concerns`.

## Error handling
- Preview heavily compressed or tinted: describe palette qualitatively and skip contrast numbers.
- Dark and light variants shown together: describe both and which is primary.
- Palette conflicts with the project's established brand: still describe it accurately; note the conflict in `weaknesses` for this project.

## Related
- `visual-composition-analysis` — inspection pipeline.
- `typography-analysis` — text readability.
- `ux-pattern-analysis` — color patterns across references.
