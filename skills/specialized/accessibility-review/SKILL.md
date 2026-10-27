---
name: accessibility-review
description: Review designed screens against WCAG AA and the design system's accessibility rules, combining structural results, measured contrast and preview inspection.
category: specialized
agents: [design-qa-agent]
tools: [magec_qa_run, magec_contrast_check, magec_tokens_audit, magec_figma_read, magec_figma_export_preview, magec_artifact_read]
related: [design-validation, accessibility-guidelines, responsive-qa, visual-qa]
---

# Accessibility review

## Purpose
Ensures generated designs meet WCAG AA and the project's `accessibilityRules`. Structural QA measures text
contrast, missing fonts, touch targets and RTL alignment on live nodes; this skill adds what needs judgement:
non-text contrast, focus visibility, color-only meaning, form labelling and reading order.

## When to use
- Every `design-qa` task.
- Specifically after QA reports `text-contrast`, `touch-target`, `missing-font` or `rtl-alignment` failures, to confirm root cause.

## Inputs
- `magec_qa_run` checks and issues.
- `accessibilityRules` and component `accessibility` arrays from `design-system/design-system.json`.
- Previews and live node data.

## Outputs
- Accessibility issues with measured evidence and suggestions; severities: `critical` for unreadable text (ratio < 75% of requirement) or missing fonts, `major` for AA failures and missing focus/labels, `minor` for best-practice gaps.

## Tool requirements
- `magec_contrast_check` — non-text pairs (borders, icons, focus rings ≥ 3:1) and text on images/gradients you sample.
- `magec_tokens_audit` — if failures trace to tokens, confirm and route to design-system-agent.
- `magec_figma_read` `read_node` — fonts, sizes, fills of suspect nodes.

## Instructions
1. Take structural results as given: `text-contrast` issues include ratio and requirement in `evidence`.
2. Text over images or gradients is not measurable structurally: inspect the preview, sample the worst area, measure with `magec_contrast_check`.
3. Non-text contrast: input borders, icon-only buttons, chart lines and focus indicators ≥ 3:1 against adjacent colors.
4. Meaning not by color alone: errors, statuses, required fields have text or icon too.
5. Forms: visible persistent labels, error text near the field, clear required markers.
6. Focus and states: interactive components have visible focus variants (check component sets).
7. Text size: body ≥ 16px on web/mobile; no essential text below 12px.
8. RTL/Arabic: Arabic text uses an Arabic-capable font (no `missing-font`), right-aligned in RTL, adequate line height.
9. If several failures come from one token, report one issue that names the token in `suggestion` (e.g. "design system: darken `text-muted` to ≥ 4.5:1 on `surface`"); the orchestrator routes system-level fixes.

## Constraints
- Ratios must come from tools; no "looks fine".
- Do not lower severity for brand reasons; restrictions belong in the design system.
- Skipped structural checks remain skipped with their reason.

## Validation
- Every accessibility issue cites a measured ratio, size or missing element.
- Each `accessibilityRules` entry that can be checked on Figma output was checked or listed as a limitation.

## Error handling
- Cannot sample a background (complex image): report as a limitation with the region, suggest an overlay/scrim.
- Font availability unknown in the reviewer's environment: rely on `missing-font` from live data only.

## Related
- `accessibility-guidelines` — the rules being verified.
- `design-validation` — assembles the report.
