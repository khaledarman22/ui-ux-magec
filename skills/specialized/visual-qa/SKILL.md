---
name: visual-qa
description: Visually inspect exported PNG previews of designed screens and report evidence-based visual issues that structural checks cannot catch.
category: specialized
agents: [design-qa-agent]
tools: [magec_qa_run, magec_figma_export_preview, magec_figma_read, magec_artifact_read]
related: [design-validation, responsive-qa, component-consistency, accessibility-review]
---

# Visual QA

## Purpose
Structural rules see properties; they do not see a cramped hero, an off-brand image, a misaligned column or a
design that ignores the selected concept. Visual QA looks at the real previews and records these as issues
with `source: "visual"`. It is only reported as performed when the images were actually viewed.

## When to use
- Every `design-qa` iteration after `magec_qa_run`.

## Inputs
- Preview paths returned by `magec_qa_run` (`previews[].absolutePath`) or `magec_figma_export_preview` (`absolutePath`).
- Accepted concept (`concepts/*.json`), brand rules, product analysis (page sections and their purpose).
- Previous QA report for this page.

## Outputs
- Visual issues: `{ "issueId": "vis-home-mobile-hero-crowded", "rule": "visual-hierarchy", "severity": "major", "message": "Hero CTA competes with two secondary links of equal weight", "screen": "home-mobile", "logicalId": "screen/home-mobile/hero", "evidence": "reports/previews/home-mobile-it1.png", "suggestion": "Make secondary links text-only $type.body-sm", "source": "visual" }`.
- `visualReview.previews` (paths viewed) and `visualReview.notes` (short overall assessment).

## Tool requirements
- Host `Read` on every preview image — this is the review.
- `magec_figma_export_preview` at `scale` 1–2 for a close-up when a 0.5 preview is too small to judge text.
- `magec_figma_read` `read_node` to find the `logicalId` of a region you want to cite.

## Instructions
1. Open each preview. Check the whole screen first, then section by section.
2. Hierarchy: one dominant element per section; primary CTA visually primary; headings read in order.
3. Alignment and rhythm: consistent left/start edges, grid adherence, even section spacing, no orphaned elements.
4. Fidelity to concept and brand: palette roles, typography character, imagery direction, density match the accepted concept.
5. Content: realistic copy (no lorem ipsum), no truncation mid-word, images not stretched or pixelated, placeholders visible as such.
6. Polish: consistent corner radii, icon sizes and stroke weights; no accidental overlaps.
7. Cite each issue with screen, region logicalId when possible, the preview path as evidence, and a concrete suggestion.
8. Re-check previous visual issues and drop only those you confirm fixed in the new preview.

## Constraints
- `visualReview.performed` is true only after viewing the images; listing paths you did not open is a false claim.
- Taste is not a defect: report deviations from concept, brand, usability or consistency.
- Severity: `major` for hierarchy/usability or concept breaks, `minor` for polish.

## Validation
- Every visual issue has evidence (preview path) and a suggestion.
- Paths in `visualReview.previews` exist under `reports/previews/`.
- Previews reviewed belong to the current iteration (`<screen>-it<iteration>.png`), not an earlier one.

## Error handling
- Preview export failed or image unreadable: set `performed: false` for that screen's part, note it in `remainingLimitations`.
- Preview too small: re-export at higher scale before judging.

## Related
- `design-validation` — assembles the report.
- `responsive-qa`, `accessibility-review`, `component-consistency`.
