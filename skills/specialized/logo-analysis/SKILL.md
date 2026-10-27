---
name: logo-analysis
description: Inspect the actual logo files supplied with the project and extract colors, letterforms and constraints that the digital identity must preserve.
category: specialized
agents: [brand-identity-agent]
tools: [magec_task_start, magec_asset_list, magec_project_context, magec_memory_search, magec_contrast_check, magec_assumption_record, magec_artifact_write]
related: [brand-analysis, palette-generation, typography-selection]
---

# Logo analysis

## Purpose
The logo is the strongest evidence of an established identity. This skill turns the real logo files in
`assets/logos/` into facts (hex colors, mark type, letterform style, clear-space and minimum-size needs) that
`brand-analysis` and `palette-generation` build on. Nothing is inferred from the project name or industry alone.

## When to use
- At the start of every `brand-analysis` task.
- When the user adds or replaces a logo and the brand analysis must be refreshed.

## Inputs
- `magec_asset_list` output: absolute paths of files under `assets/logos/` (and `assets/images/` for brand imagery).
- Project languages and direction from `magec_project_context` (an Arabic wordmark changes typography needs).
- Prior brand decisions from `magec_memory_search` (query `brand logo`).

## Outputs
- Facts that feed the `BrandAnalysis` contract: `assetsInspected` (workspace-relative paths you actually opened),
  `colors[]` entries with `source: "extracted"`, and logo usage `rules` / `constraints`.
- Optional notes artifact `planning/logo-notes.md` when the logo has several variants worth documenting.

## Tool requirements
- `magec_asset_list` — the only reliable way to find the files; never guess paths.
- Host `Read` on each image's absolute path — this is how you actually see the logo.
- `magec_contrast_check` — test the logo's main color against white and dark backgrounds.
- `magec_assumption_record` — when no logo exists or a file cannot be read.

## Instructions
1. Call `magec_asset_list`. Collect every file under `assets/logos/`; note format (SVG, PNG, JPEG, PDF).
2. Open each logo image with `Read` and look at it. For SVG, also read the markup: `fill`/`stroke` values are exact colors.
3. For each file record: mark type (wordmark, lettermark, symbol, combination), dominant and secondary colors
   (hex, uppercase, 6 digits), background it was designed for, script(s) present (Latin, Arabic), letterform
   character (geometric, humanist, slab, calligraphic, rounded), stroke weight and corner style.
4. Distinguish brand colors from incidental ones (anti-aliasing, drop shadows, mockup backgrounds). If raster
   sampling is uncertain, say so in `constraints` rather than reporting a precise-looking hex.
5. Run `magec_contrast_check` for primary logo color on `#FFFFFF` and on the darkest proposed surface; record
   which backgrounds the logo may sit on as `rules` (e.g. "Primary logo only on light surfaces, ≥3:1").
6. Derive constraints: minimum size where the mark stays legible, clear space (use a logo-relative unit such as
   cap height), forbidden treatments (recoloring, stretching, effects).
7. If several versions exist (horizontal, stacked, monochrome), list which to use in header, favicon and footer.
8. If no logo is supplied, record an assumption ("No logo supplied; identity proposed from brief") and hand off
   to `brand-analysis` with `established: false`.

## Constraints
- Report only files you opened; `assetsInspected` must match real paths from `magec_asset_list`.
- Never redraw, simplify or "modernize" the logo; changes to the mark are out of scope.
- Do not import or place the logo in Figma; that is `figma-asset-management` (figma-designer).
- Extracted colors keep `source: "extracted"`; anything you derive is `"proposed"`.

## Validation
- Every hex in the output appears in the logo (SVG source or visible pixels) or is explicitly marked proposed.
- Contrast numbers come from `magec_contrast_check`, not estimation.
- Arabic letterforms present in the logo are mentioned, so typography selection accounts for them.

## Error handling
- Unreadable or unsupported file (e.g. PDF, AI): list it in `constraints` as "not inspected" and continue with the rest.
- Conflicting logo versions (different colors): report both, ask in `openQuestions`/notes which is current; do not pick silently.
- Empty `assets/logos/`: record the assumption and continue; this is not a task failure.

## Related
- `brand-analysis` — combines logo facts with brief and imagery.
- `palette-generation` — builds the digital palette around extracted colors.
- `typography-selection` — matches type to the logo's letterforms.
