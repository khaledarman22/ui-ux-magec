---
name: requirements-analysis
description: Extract functional requirements and business rules from the brief and audiences, each feature justified by a user or business need.
category: specialized
agents: [product-analyst]
tools: [magec_project_context, magec_artifact_read, magec_memory_search, magec_assumption_record, magec_decision_record, magec_artifact_write]
related: [product-discovery, feature-planning, scope-prioritization, quality-standards]
---

# Requirements analysis

## Purpose
Features drive pages, research categories and the MVP. A feature without a reason becomes design work nobody needs.
This skill produces the candidate `features` list and `businessRules` of `ProductAnalysis`, each feature tied to a
real audience need or business constraint.

## When to use
- After `product-discovery`, inside the `product-analysis` task.
- When the user adds a requirement later ("we also need a comparison tool").

## Inputs
- Audiences, roles and needs from `product-discovery`.
- The brief, assets and memory (decisions, assumptions, feedback).

## Outputs
- Candidate features with `id`, `name`, `description`, `justification` (min. 10 chars, real reasoning).
- `businessRules[]`: constraints the UI must respect ("listings expire after 60 days", "prices shown in EGP incl. VAT").

## Tool requirements
- `magec_assumption_record` — for requirements inferred rather than stated.
- `magec_decision_record` — for scoping decisions the user already confirmed.
- `magec_artifact_write` — optional working notes (e.g. `planning/notes-requirements.md`).

## Instructions
1. Walk each audience need and ask: what must the product let this role do? Each answer is a candidate feature.
2. Add features required by the product type itself (auth for multi-role products, empty/error handling for listings, contact or lead capture for marketplaces).
3. Write the `justification` as cause → effect: "Buyers shortlist 5-10 properties before visiting; saved lists remove re-searching." The phrase "competitors have it" is not a justification.
4. Make descriptions testable: what the user sees and can do, not implementation detail.
5. Extract business rules from the brief and from domain knowledge; mark domain-derived rules as assumptions.
6. Merge duplicates (e.g. "search" and "filtering" become one feature if they share one UI, or stay separate with distinct justifications).
7. Hand the list to `feature-planning` for detailing and `scope-prioritization` for must/should/could.

## Constraints
- No feature without a justification grounded in an audience need, a business rule or a legal/accessibility requirement.
- Do not add speculative features (AI chat, gamification) unless the brief or a need supports them.
- Keep implementation choices (frameworks, vendors) out; this is product scope.

## Validation
- Every feature id is lowercase kebab-case and unique.
- Every audience has at least one feature serving it; every feature serves at least one audience or rule.
- Business rules are concrete and checkable.

## Error handling
- A requirement is unclear but cheap to assume: assume and record it.
- A requirement conflicts with another (e.g. "no sign-up" vs "saved favourites"): list both options in `openQuestions` and pick a default with an assumption.

## Related
- `product-discovery` — source of audiences and needs.
- `feature-planning` — fills states, pages and research categories.
- `scope-prioritization` — assigns must/should/could.
