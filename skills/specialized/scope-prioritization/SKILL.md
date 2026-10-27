---
name: scope-prioritization
description: Split features into must, should and could, define the MVP feature list, and make every priority defensible against the brief and audience needs.
category: specialized
agents: [product-analyst]
tools: [magec_project_context, magec_artifact_read, magec_memory_search, magec_assumption_record, magec_decision_record, magec_approval_request, magec_task_complete, magec_task_fail]
related: [requirements-analysis, feature-planning, information-architecture, structured-output]
---

# Scope prioritization

## Purpose
Priority controls real work: `must` and `should` pages are designed, `could` pages are not; `mvpFeatureIds` tells
every agent what the first release needs. This skill applies a consistent MoSCoW split so scope matches the brief,
not the agent's enthusiasm.

## When to use
- Last step of the `product-analysis` task, before `magec_task_complete`.
- When the user asks to cut or expand scope ("just the MVP", "add phase 2 features").

## Inputs
- Detailed features with justifications, audiences, business rules.
- Accepted scoping decisions from memory.

## Outputs
- `features[].priority` set to `must`, `should` or `could`.
- `mvpFeatureIds[]`: the ids of all `must` features (plus any `should` the user explicitly put in the MVP).
- Sitemap page priorities consistent with their features.

## Tool requirements
- `magec_decision_record` — when the user confirmed a scope choice.
- `magec_approval_request` — only if the MVP cut is ambiguous and materially changes the product.
- `magec_task_complete` — submits the full `ProductAnalysis`.

## Instructions
1. `must`: without it the primary flow of a primary role fails, or a legal/business rule is broken (e.g. property search, listing detail, contact agent).
2. `should`: strongly improves the primary flow or serves a secondary role, but a workaround exists (e.g. saved searches, map view).
3. `could`: nice to have, low frequency or later phase (e.g. mortgage calculator, compare tool).
4. Test each `must` by removing it mentally: if the product still works for its main audience, it is not `must`.
5. Keep the MVP small: typically 4-8 `must` features for a marketing site or simple marketplace; explain in `notes` when more are needed.
6. Fill `mvpFeatureIds` and align page priorities (a page is at least as high as its highest feature).
7. Record user-confirmed priorities with `magec_decision_record`; record inferred ones in `assumptions`.
8. Submit the complete analysis with `magec_task_complete`; fix and resubmit on validation errors.

## Constraints
- Every feature keeps its justification; priority changes do not remove it.
- Do not mark everything `must`. If the brief demands it, say so and list the risk in `notes`.
- Do not drop features the user explicitly requested; lower their priority only with a stated reason.

## Validation
- `mvpFeatureIds` is non-empty and contains only existing feature ids.
- Every `must` feature has a page, a research category and appears in a flow.
- Page priorities agree with feature priorities.

## Error handling
- User and analysis disagree on priority: the user wins; record the decision.
- Contract rejects the output: fix the named fields (often `justification` too short or bad ids) and resubmit; after two failed corrections, `magec_task_fail` with kind `validation`.

## Related
- `requirements-analysis`, `feature-planning`, `information-architecture` — inputs to this step.
- `structured-output` — submission rules.
