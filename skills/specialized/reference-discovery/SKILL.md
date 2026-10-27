---
name: reference-discovery
description: Plan feature-specific queries and collect real, retrievable UI references from multiple permitted sources, recording only fetched pages as verified.
category: specialized
agents: [research-agent]
tools: [magec_task_start, magec_artifact_read, magec_research_sources, magec_research_plan_queries, magec_research_search, magec_research_submit_candidates, magec_reference_list, magec_task_complete, magec_task_fail]
related: [competitor-research, visual-research, reference-evaluation, source-deduplication, source-validation]
---

# Reference discovery

## Purpose
Concepts and designs are only as good as the references behind them. This skill finds real pages for each
research category (from `features[].researchCategories`) across several sources, and produces the `ResearchPlan`
(for `research-plan` tasks) and the candidate set behind each `ResearchReport` (for `research` tasks).

## When to use
- `research-plan` task: build queries for a scope.
- `research` task: run the planned queries for one `category`.

## Inputs
- `planning/product-analysis.json` (features, `researchCategories`, industry, market, languages).
- `research/plan-<scope>.json` for research tasks; task `params` (`category`, `request`, `avoidRejected`).
- Rejected directions from the task context.

## Outputs
- `ResearchPlan`: `goal`, `queries[]` (`query`, `category`, `featureId`, `sources`, `styleAngle`), `avoid[]`.
- References stored by `magec_research_submit_candidates`, verified or not, with provenance.

## Tool requirements
- `magec_research_sources` — access policy per source (public-page, api-key, login-required).
- `magec_research_plan_queries` — `industry`, `market`, `categories[]`, `styleAngles`, `sources`, `perCategory`; skips queries already run.
- `magec_research_search` — configured search API (Brave). Returns `available: false` when not configured.
- `magec_research_submit_candidates` — `candidates[]` of `{ url, title, description, category, query, style, provider }`.

## Instructions
1. Call `magec_research_sources` once per task to confirm access policies.
2. Build queries with `magec_research_plan_queries`. Queries must name the feature and domain: "real-estate property filters sidebar", "Arabic e-commerce product cards RTL", "booking calendar mobile clinic app".
3. Rotate style angles across queries (e.g. editorial, minimal, data-dense, playful, luxury, brutalist, warm-local) so results are not one aesthetic.
4. Spread queries across sources: Behance and Dribbble (exploration), Awwwards, SiteInspire, Land-book, One Page Love (production and landing pages), Pinterest (moodboards), and live production sites (`competitor-research`). Use at least three sources per category.
5. Run each query with `magec_research_search`. If it returns `available: false`, use the host's own web search tool with the same query (add the source's `site:` filter, e.g. `site:dribbble.com/shots`), then submit the URLs you found.
6. Submit only URLs you actually saw in search results via `magec_research_submit_candidates`, with `category`, the exact `query`, `style` angle and `provider` (`brave`, `host`).
7. Read the response: `added` (verified), `duplicates`, `unverified` (with reason). Only `added` items count as verified references.
8. Stop a category at 8-15 verified, diverse references; record every source tried and its status for the report.

## Constraints
- Never fabricate URLs, titles, shot ids or descriptions. If a search found nothing, the result is "empty".
- Never log in, bypass CAPTCHAs, paywalls or robots.txt. Mobbin is login-only: do not fetch it; record `login-required` and, if the user supplies Mobbin links, submit them knowing they stay unverified.
- Do not treat search snippets as verification; only retrieval by the fetcher verifies.
- Respect `avoid` and rejected directions; do not re-query angles the user rejected.

## Validation
- Each category has queries on at least three sources and at least two style angles.
- Every `referenceIds` entry you report exists in `magec_reference_list` with `verified: true`.
- `sourcesTried` lists each source with `ok`, `empty`, `blocked`, `login-required`, `error` or `skipped`.

## Error handling
- Fetch blocked or robots-disallowed: keep it unverified; do not retry around the block.
- Search provider errors: fall back to host search once; if both fail, report `error` per source and `magec_task_fail` only if no source worked.
- Too few verified results: broaden the query one step (feature + industry → feature + adjacent industry) and say so in `summary`.

## Related
- `competitor-research`, `visual-research` — specialised query sets.
- `reference-evaluation`, `source-deduplication` — what happens after submission.
- `source-validation` — shared verification rules.
