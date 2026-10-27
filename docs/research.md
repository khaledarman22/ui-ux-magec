# Research

## Sources

| Source | Access | Behaviour |
|---|---|---|
| Behance, Dribbble, Awwwards, SiteInspire, Land-book, One Page Love | Public pages | Discovered via search and fetched to verify (robots.txt respected) |
| Production websites | Public | Same as above |
| Pinterest | API key required | Pins are recorded only from search results; never scraped |
| Mobbin | Login required | **Never fetched.** Recorded as unverified with the reason |

## Discovery

- **`BraveSearchProvider`:** used when `BRAVE_SEARCH_API_KEY` is set.
- **Otherwise:** the host assistant uses its own web search or browser and submits URLs with
  `magec_research_submit_candidates`.

Every candidate is fetched by `ResearchFetcher` before it can count:

- robots.txt is checked for the `ui-ux-magec-research` user agent
- requests are throttled per host
- size and time limits apply
- redirects are recorded
- login walls and CAPTCHAs are detected and not bypassed

## Rules

- `verified: true` only if the page was actually retrieved. Anything else is stored with
  `verification.failure`.
- Analyses of unverified references are refused, unless they came from a screenshot the user supplied.
- Deduplication, in order:
  1. canonical URL (tracking parameters, `www`/`m.` prefixes and platform slugs removed)
  2. platform item ID
  3. preview hash
  4. near-identical title on the same host
- Ranking (`magec_reference_select`) combines relevance (category, industry, keywords, style) with MMR
  diversity and a usage penalty. Usage can include opt-in cross-project counts, so the same popular shots are
  not reused every time.
- Queries are feature-specific (for example "Arabic e-commerce product cards"), rotate style angles and skip
  queries already run (`research/queries.jsonl`).
- Research reports must list every source tried and its status (ok, empty, blocked, login-required, error).
