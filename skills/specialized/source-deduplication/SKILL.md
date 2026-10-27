---
name: source-deduplication
description: Keep one reference per real design by catching duplicates across URLs, mirrors and sources, so ranking and analysis are not skewed by repeats.
category: specialized
agents: [research-agent]
tools: [magec_reference_list, magec_research_submit_candidates, magec_reference_reject, magec_reference_select, magec_artifact_read]
related: [reference-discovery, reference-evaluation, visual-research, source-validation]
---

# Source deduplication

## Purpose
The same project often appears as a Behance case study, several Dribbble shots, a Pinterest pin and an Awwwards
entry. Counting it four times makes one designer's work look like a trend and crowds out alternatives. The runtime
detects exact duplicates; this skill handles the cross-source ones it cannot see.

## When to use
- After each batch of `magec_research_submit_candidates`.
- Before `reference-evaluation` builds the final set.

## Inputs
- Submission results: `added`, `duplicates` (`url`, `duplicateOf`), `unverified`.
- `magec_reference_list` for the category: `canonical_url`, `source_item_id`, `title`, `source`, `preview_hash`.

## Outputs
- A category library where each real design is represented once, by its best source.
- Rejections of redundant entries with reasons naming the kept reference id.

## Tool requirements
- `magec_research_submit_candidates` — runtime detects same canonical URL and same platform item id (Behance gallery id, Dribbble shot id, Awwwards site slug, Pinterest pin id, SiteInspire id, Land-book slug).
- `magec_reference_reject` — `reason` such as "duplicate of ref_ab12 (same project, Behance case study kept)".

## Instructions
1. Read `duplicates` from every submission; do not resubmit those URLs with tracking parameters or alternate paths.
2. Strip tracking parameters (`utm_*`, `ref`), fragments and locale prefixes before submitting; submit canonical URLs.
3. Look for cross-source duplicates: same title or studio, same `preview_hash`, an Awwwards entry pointing to a production site already in the library, a pin whose target is a Behance project you have.
4. Keep the most informative version: production site > full case study (Behance) > single shot (Dribbble) > pin. Prefer the one with a preview image when equal.
5. Reject the redundant entries with a reason naming the kept id.
6. Treat several shots from one designer series as one approach; keep at most two unless they show distinct features.
7. Re-run `magec_reference_select` after cleanup to confirm diversity improved.

## Constraints
- Do not reject a reference as duplicate on title alone when visuals may differ; confirm by preview or URL target.
- Never delete; rejection with reason keeps provenance.
- Do not merge different products from the same studio.

## Validation
- No two non-rejected references in a category share a canonical URL, platform item id or preview hash.
- Each duplicate rejection names the kept reference.
- The report's `referenceIds` contain no duplicates after cleanup.
- Source counts in `sourcesTried` notes reflect unique designs, not raw hits.

## Error handling
- Unsure whether two entries are the same work: keep both and note it in the report `summary` for visual analysis to confirm.
- A kept reference later fails verification: restore coverage by keeping the next best duplicate (submit it again if it was never added).

## Related
- `reference-discovery` — canonical submission.
- `reference-evaluation` — ranking after cleanup.
- `source-validation` — provenance rules.
