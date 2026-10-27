---
name: source-validation
description: Gather and use design references only from permitted, retrieved sources; never fabricate, never bypass access controls, and label verification honestly.
category: shared
agents: []
tools: [magec_research_sources, magec_research_submit_candidates, magec_reference_list, magec_reference_preview, magec_reference_reject]
related: [tool-selection, quality-standards, structured-output]
---

# Source validation

## Purpose
Concepts and designs are justified by references. A fabricated or unverifiable reference corrupts every
downstream decision. This skill sets the rules for what counts as a source, how candidates become verified
references, and how to report what could not be accessed.

## When to use
- Planning or running research, or analysing references.
- Citing reference ids in concepts, analyses or decisions.
- Deciding whether a reference can be trusted or should be rejected.

## Inputs
- Source policies from `magec_research_sources` (public page, API key, login required) and their strengths.
- Candidate URLs from `magec_research_search` or the host's web search.
- The project reference library (`references/references.json`) via `magec_reference_list`.

## Outputs
- Verified references with provenance (source, URL, query, retrieval time, preview path).
- Honest `sourcesTried` entries: `ok`, `empty`, `blocked`, `login-required`, `error`, `skipped`.

## Tool requirements
- `magec_research_sources` — which sources are usable and how.
- `magec_research_submit_candidates` — fetches each URL (robots.txt respected, no logins), stores it, and
  marks only retrieved pages verified; detects duplicates.
- `magec_reference_list` — check the library and verification state (`verifiedOnly`).
- `magec_reference_preview` — ensure a local preview image exists for inspection.
- `magec_reference_reject` — exclude unsuitable references with a reason.

## Instructions
1. Check source policies first; skip sources that require login or an API key you do not have, and record them
   as `login-required` or `skipped`.
2. Submit every candidate URL through `magec_research_submit_candidates`. A URL is "verified" only after the
   runtime retrieved it. Search snippets, memory and model knowledge are never verification.
3. Use real URLs exactly as found. Never construct, guess or "fix" URLs, titles or authors.
4. Prefer specific pages (a product's pricing page, a Dribbble shot) over home pages and listicles.
5. Analyse only what you inspected: a downloaded preview, the live page or a screenshot. If the preview is
   missing, call `magec_reference_preview`; if it still fails, say the reference was not visually inspected.
6. Reject references that are duplicates, irrelevant, inaccessible, low quality or stylistically incompatible
   with accepted decisions, with a concrete reason.
7. Cite reference ids from the library in outputs; every id must exist in `magec_reference_list`.
8. Diversify: avoid relying on the same popular references; use `magec_reference_select` rankings.

## Constraints
- Never fabricate references, results, screenshots, metrics or quotes.
- Never bypass logins, CAPTCHAs, paywalls, rate limits or robots.txt, and never use credentials or cookies to
  reach gated content.
- Do not scrape at volume; stay within the planned queries.
- Do not copy a reference's design wholesale; references inform, they are not templates.
- Unretrieved candidates stay unverified and must not be presented as verified.

## Validation
- Every cited reference id resolves in the library; verified claims match the `verified` flag.
- `sourcesTried` lists every source attempted with its real status.
- Analyses cite the preview or page actually inspected.

## Error handling
- Search provider unavailable: fall back to host web search and submit URLs; record the provider as `error`.
- Retrieval blocked (robots.txt, 403, login wall): leave it unverified, record `blocked`/`login-required`,
  and move on. Do not retry with workarounds.
- Too few verified references: report the shortfall honestly; do not pad with unverified or invented ones.

## Related
- `tool-selection` — research tool fallbacks.
- `quality-standards` — originality.
- `structured-output` — reporting verified versus unverified evidence.
