---
name: gap-detection
description: Find missing screens, missing states, inconsistencies and navigation holes in an existing design by comparing what exists with what the product needs.
category: specialized
agents: [ux-audit-agent]
tools: [magec_figma_read, magec_figma_export_preview, magec_artifact_read, magec_tokens_audit, magec_contrast_check, magec_assumption_record]
related: [ux-audit, flow-validation, usability-analysis, improvement-planning]
---

# Gap detection

## Purpose
Produces `UXAuditReport.gaps[]`: concrete, located differences between the current design and what users and
the product require. A gap is evidence-based ("Checkout has no error state"), not taste ("hero feels dated").

## When to use
- Inside every `ux-audit` task.
- When planning extensions to an existing file.

## Inputs
- Inventory from `ux-audit` (pages, frames, components, styles, variables).
- Product needs: features and their `states`, sitemap, user flows (`planning/product-analysis.json`), or the brief.
- Project `settings.breakpoints` and `direction` for coverage expectations.

## Outputs
Gap objects: `id` (kebab-case, stable), `kind` (`missing-screen`, `missing-state`, `inconsistency`, `navigation`,
`accessibility`, `content`, `other`), `description`, `severity` (`critical` | `major` | `minor`), `location`, `recommendation`.

## Tool requirements
- `magec_figma_read` `read_node` — inspect frames and component variants for states.
- `magec_contrast_check` — measure suspect text/background pairs read from nodes.
- `magec_tokens_audit` — when the file has variables, audit them as a token set for contrast coverage.

## Instructions
1. Missing screens: compare sitemap pages with Figma pages/frames; also check expected breakpoints and RTL versions per project settings.
2. Missing states: for each feature state (loading, empty, error, success, hover, focus, disabled) look for a frame or a component variant that renders it.
3. Inconsistencies: same component drawn differently, detached copies instead of instances, multiple near-identical colors or type sizes, spacing values off any apparent scale, mixed icon styles.
4. Navigation: dead ends (no way back), unreachable pages, inconsistent nav between pages, missing breadcrumbs or back on mobile detail screens.
5. Accessibility: text below AA (measure), tiny touch targets on mobile frames, color-only status, missing focus states, Arabic text left-aligned in RTL frames.
6. Content: lorem ipsum, placeholder images, truncated or overflowing copy, untranslated strings in bilingual products.
7. For each, write the location as `Page / Frame — breakpoint` and a recommendation that uses existing components/styles where possible.
8. Deduplicate: one gap per root cause, listing additional locations in the description.

## Constraints
- Only report what you inspected; no assumed gaps from frame names alone without opening them.
- Severity reflects user impact, not effort.
- Stable ids (`gap-<area>-<issue>`) so later tasks and feedback can reference them.

## Validation
- Every gap has evidence: node name, measured ratio, or missing item vs a named requirement.
- No duplicate root causes.
- Coverage gaps (breakpoint, RTL) are checked against project settings, not against a generic ideal.

## Error handling
- Product requirements unknown: derive expectations from common patterns for the product type and record the assumption with `magec_assumption_record`.
- Hidden/archived pages: note them; do not count them as gaps.

## Related
- `flow-validation` — finds gaps along flows.
- `improvement-planning` — turns gaps into scoped work.
