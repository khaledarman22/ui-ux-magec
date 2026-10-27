---
name: brand-analysis
description: Produce the BrandAnalysis contract — established vs new identity, personality, colors and typography with provenance — while preserving what already exists.
category: specialized
agents: [brand-identity-agent]
tools: [magec_task_start, magec_task_complete, magec_task_fail, magec_project_context, magec_asset_list, magec_artifact_read, magec_memory_search, magec_decision_record, magec_assumption_record, magec_contrast_check, magec_tokens_audit, magec_message_send]
related: [logo-analysis, palette-generation, typography-selection, brand-guidelines]
---

# Brand analysis

## Purpose
Owns the `brand-analysis` task. It decides how much identity already exists and must be preserved, and
produces `planning/brand-analysis.json` (`BrandAnalysis` schema) that the creative director and design-system
agent rely on. Preservation comes first: an established brand is extended, never replaced.

## When to use
- When a `brand-analysis` task is assigned to brand-identity-agent.
- When feedback says the brand feels "off" and a re-analysis task is created.

## Inputs
- Task brief from `magec_task_start` (params may name the scope).
- `planning/brief.md`, `planning/product-analysis.json` (audiences, `languages`, `direction`) via `magec_artifact_read`.
- Logo facts from `logo-analysis`; other brand imagery from `magec_asset_list`.
- Existing decisions: `magec_memory_search` with `brand`, `color`, `font`; respect `accepted` and `rejected` ones.

## Outputs
`BrandAnalysis` passed to `magec_task_complete`:
```json
{
  "assetsInspected": ["assets/logos/logo-primary.svg"],
  "established": true,
  "personality": ["trustworthy", "warm", "precise"],
  "colors": [
    { "hex": "#0E5A8A", "role": "primary", "source": "extracted" },
    { "hex": "#F4A23B", "role": "accent", "source": "proposed" }
  ],
  "typography": [
    { "family": "IBM Plex Sans Arabic", "usage": "UI and body, en + ar", "source": "proposed", "supportsArabic": true }
  ],
  "rules": ["Primary logo only on light surfaces"],
  "constraints": ["Logo PNG only; colors sampled from raster"],
  "proposedDecisions": ["dec_…"]
}
```

## Tool requirements
- `magec_decision_record` with `status: "proposed"` for every new color or font; ids go into `proposedDecisions`.
- `magec_contrast_check` / `magec_tokens_audit` to prove proposals meet WCAG AA.
- `magec_assumption_record` for gaps (no logo, no fonts specified).

## Instructions
1. Run `logo-analysis`. Set `established: true` when a logo, style guide or existing site/app colors exist.
2. Read the brief and product analysis; note audiences, market, `languages` and `direction`.
3. Infer 3–5 personality traits from evidence (logo style, brief wording, audience). Each must be defensible.
4. List colors: extracted ones first with their role; then `palette-generation` proposals marked `"proposed"`.
5. List typography: fonts visible in assets or named in the brief as `"extracted"`; otherwise run
   `typography-selection`. Set `supportsArabic` for every family when `ar` is a language.
6. Record each proposal with `magec_decision_record` (`topic` like `brand.color.accent`, `status: "proposed"`,
   `scope: "project"`, rationale citing the evidence) and collect the returned ids.
7. Write usage `rules` (what must stay true) and `constraints` (what limits the analysis).
8. Complete with `magec_task_complete`; fix schema errors and resubmit.

## Constraints
- Never change or drop an extracted brand color; extend with tints/neutrals instead.
- Do not mark proposals as accepted; only the user (via the orchestrator) accepts them.
- Do not contradict accepted decisions in memory; if evidence conflicts, raise it with `magec_message_send` to `master-orchestrator`.
- Personality words must be specific; avoid "modern", "clean" unless backed by evidence.

## Validation
- `colors` has at least one entry and every `extracted` color traces to `assetsInspected`.
- Every `proposed` color/font has a decision id in `proposedDecisions`.
- Text-on-color pairs implied by the palette pass AA in `magec_contrast_check`.
- If `ar` is a language, at least one family has `supportsArabic: true`.

## Error handling
- No assets and a vague brief: produce a minimal analysis with `established: false`, record assumptions, and list proposals; do not fail.
- Schema rejection: fix the named fields only.
- Assets unreadable: `magec_task_fail` with kind `external` only if nothing at all can be inspected and the brief gives no direction.

## Related
- `logo-analysis`, `palette-generation`, `typography-selection` — inputs to this analysis.
- `brand-guidelines` — turns the analysis into usable rules.
