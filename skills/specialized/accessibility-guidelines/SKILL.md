---
name: accessibility-guidelines
description: Define testable WCAG AA rules for color, type, targets, focus, states and bilingual content, backed by measured contrast.
category: specialized
agents: [design-system-agent]
tools: [magec_tokens_audit, magec_contrast_check, magec_artifact_read, magec_project_context, magec_decision_record]
related: [design-token-generation, component-architecture, accessibility-review, design-system-planning]
---

# Accessibility guidelines

## Purpose
Writes `DesignSystemSpec.accessibilityRules` and per-component `accessibility` requirements so that designs are
accessible by construction and design-qa-agent can verify them. Every color rule is backed by a measured ratio.

## When to use
- In every `design-system` task.
- When QA reports recurring `text-contrast`, `touch-target` or `rtl-alignment` issues traceable to the system.

## Inputs
- Token set (colors, themes, typography).
- Components and their states.
- Project languages and direction.

## Outputs
- `accessibilityRules[]`, for example:
  - "Body and label text ≥ 4.5:1 against its background; large text (≥ 24px, or ≥ 18.66px bold) ≥ 3:1."
  - "UI boundaries (input borders, focus ring) ≥ 3:1 against adjacent colors."
  - "Interactive targets ≥ 44×44 on mobile; ≥ 8px spacing between adjacent targets."
  - "Focus state: 2px ring $color.focus with 2px offset on every interactive component."
  - "State is never conveyed by color alone: errors pair $color.error with icon and message text."
  - "Disabled controls keep labels readable; disabled is not the only explanation of why."
- Component-level `accessibility` arrays.

## Tool requirements
- `magec_contrast_check` — measure each foreground/background pair with its `fontSize`/`fontStyle`.
- `magec_tokens_audit` — whole-set audit including themes.

## Instructions
1. List all intended pairs: `text`/`background`, `text`/`surface`, `text-muted`/both, `on-primary`/`primary`,
   link color/background, feedback colors with their text, placeholder text/input background, each theme.
2. Run `magec_contrast_check` with real sizes and styles; record ratio and requirement.
3. Any failing pair becomes a restriction ("text-muted not on surface-alt") or a new token; never ship it as allowed.
4. Define focus, hover, pressed and disabled appearance per interactive component; focus must be visible without hover.
5. Define minimum sizes: body ≥ 16px web, captions ≥ 12px and only for non-essential text; touch targets ≥ 44px (QA default `minTouchTarget`).
6. Forms: visible labels (not placeholder-only), error text adjacent to the field, required markers explained.
7. Bilingual/RTL: Arabic text uses the Arabic font, right/start alignment in RTL, no letter-spacing, adequate line height; icons with direction (arrows, back) mirror, logos and media controls do not.
8. Motion (if the concept uses it): no essential information only in motion; provide reduced-motion intent.

## Constraints
- AA is the minimum; never weaken it for aesthetics.
- Rules must be checkable from Figma data or previews; avoid rules that only code can satisfy, or label them "implementation note".
- Ratios come from tools, not estimates.

## Validation
- `magec_tokens_audit` shows no unhandled failures.
- Every interactive component lists focus and disabled requirements.
- Rules cover each QA structural rule that relates to accessibility: `text-contrast`, `touch-target`, `rtl-alignment`, `missing-font`.

## Error handling
- Brand color cannot reach AA: restrict its use and add a stronger sibling token; record a decision explaining why.
- Unknown font metrics for Arabic: keep line-height generous (×1.1 of Latin) and flag for visual QA.

## Related
- `accessibility-review` — how QA verifies these rules on live designs.
- `design-token-generation` — where failing colors get fixed.
