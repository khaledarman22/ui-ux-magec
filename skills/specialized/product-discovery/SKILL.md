---
name: product-discovery
description: Establish what the product is, who it serves, in which market and languages, and which assumptions fill the gaps in the brief.
category: specialized
agents: [product-analyst]
tools: [magec_task_start, magec_project_context, magec_artifact_read, magec_asset_list, magec_memory_search, magec_assumption_record, magec_approval_request, magec_message_send]
related: [requirements-analysis, scope-prioritization, project-memory, structured-output]
---

# Product discovery

## Purpose
Every later stage (research categories, concepts, layout direction) depends on a correct reading of the product.
This skill fills the top of `ProductAnalysis`: `productType`, `industry`, `market`, `summary`, `audiences`, `roles`,
`languages`, `direction`, plus explicit `assumptions` and `openQuestions`.

## When to use
- First step of every `product-analysis` task.
- When feedback reveals the product was misunderstood (e.g. B2B mistaken for B2C).

## Inputs
- `planning/brief.md` and `project.json` (via `magec_task_start` context and `magec_artifact_read`).
- Prior decisions and assumptions (`magec_memory_search`).
- User assets (`magec_asset_list`) as hints about brand and market only.

## Outputs
- `productType` (e.g. "two-sided property marketplace"), `industry`, `market` (e.g. "Egypt, Arabic-first").
- `audiences[]` with `name`, concrete `needs`, `context` (device, situation); `roles[]` (e.g. buyer, agent, admin).
- `languages` (`en`, `ar`) and `direction` (`ltr`, `rtl`, `both`).
- `assumptions[]` with `statement`, `reason`, `impact`; `openQuestions[]` with `blocking`.

## Tool requirements
- `magec_task_start` — brief and contract.
- `magec_assumption_record` — persist each assumption as you make it.
- `magec_approval_request` — only for a blocking question the user must answer.

## Instructions
1. Read the brief twice: once for stated facts, once for what is implied but unstated.
2. Name the product type precisely: a marketplace, a booking tool, a catalogue site and a SaaS dashboard lead to different research and flows.
3. Derive audiences from who acts in the product, not from demographics alone. Give each 2-4 needs phrased as outcomes ("compare monthly cost across compounds").
4. List roles that need different permissions or screens; if there is only one role, say so.
5. Languages and direction: an Arabic brief, an Arabic market or Arabic brand assets imply `ar`; bilingual products use `both`. Record the assumption when inferred.
6. For every gap, decide: if a reasonable default exists, assume it and record it (`magec_assumption_record` with `reason` and `impact`); if the answer would materially change the product (e.g. "is there online payment?"), add a blocking `openQuestion`.
7. Write a 2-3 sentence `summary` a designer could act on.

## Constraints
- Never present an assumption as a fact; every inferred item appears in `assumptions`.
- Do not invent market data, user statistics or competitor facts.
- Ask the user only for blocking questions; batch them, at most three.

## Validation
- `audiences` has at least one entry with needs; `languages` has at least one value.
- Each assumption has a reason and impact; high-impact assumptions are also visible in the summary to the orchestrator (`notes`).
- No contradiction with accepted decisions in memory.

## Error handling
- Brief is a single line: proceed with explicit assumptions rather than stalling; flag high-impact ones.
- Brief contradicts recorded decisions: follow the newest user statement, record the assumption, and mention the conflict in `notes`.
- Blocking question unanswered: complete with the question listed as `blocking: true`; the orchestrator decides whether to wait.

## Related
- `requirements-analysis` — turns needs into features.
- `scope-prioritization` — uses audiences to rank features.
- `project-memory`, `structured-output` — shared rules.
