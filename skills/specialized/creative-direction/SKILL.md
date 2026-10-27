---
name: creative-direction
description: Run the concept-generation task end to end - gather analyses, brand and memory, set the creative strategy, produce the ConceptSet and brief the designers.
category: specialized
agents: [creative-director]
tools: [magec_task_start, magec_project_context, magec_artifact_read, magec_memory_search, magec_reference_list, magec_decision_record, magec_assumption_record, magec_artifact_write, magec_task_complete, magec_task_fail, magec_message_send]
related: [concept-generation, reference-synthesis, brand-expression, originality-review, visual-storytelling]
---

# Creative direction

## Purpose
The creative director turns research into direction. A `concept-generation` task outputs a `ConceptSet` at
`concepts/concepts-<scope>-<id>.json`; the recommended concept is recorded as a decision (accepted automatically or
proposed for user approval, depending on `conceptSelection`) and drives the design system and every Figma page.
This skill orders the work and owns the final submission.

## When to use
- Every `concept-generation` task: project scope, a section or page redesign (`params.scope`, e.g. `section:home/hero`), or `audit-proposals`.

## Inputs
- `research/visual-analysis-*.json` and `research/report-*.json` for the relevant categories.
- `planning/brand-analysis.json`, `planning/product-analysis.json`.
- Task `params`: `scope`, `avoid` / `avoidRejected`, `attributes`, `preserve`, `preserveExistingIdentity`.
- Rejected directions and recent feedback from `magec_project_context` and `magec_memory_search`.

## Outputs
- `ConceptSet`: `scope`, `concepts[]`, `recommendedConceptId`, `recommendationRationale`, `rejectedReferenceIds`, `avoided`.
- Optional brief artifact for designers (e.g. `concepts/brief-<scope>.md`).

## Tool requirements
- `magec_task_start` / `magec_task_complete` — contract and submission.
- `magec_memory_search` — kinds `decision`, `feedback` for rejected directions (tag `rejected-direction`).
- `magec_message_send` — handoff note to `design-system-agent` or `figma-designer`.

## Instructions
1. Start the task. Read every input above before generating ideas; note the brand's established constraints and the scope.
2. Write down, in one line each: the audience's core need, the product's differentiation opportunity (from research gaps), and the rejected directions to avoid.
3. Run `reference-synthesis` to extract principles and approaches with reference ids.
4. Run `brand-expression` to fix what is non-negotiable (established logo colors, required fonts) versus open.
5. Run `concept-generation` for 2-3 concepts (1 only when the scope is a small section and the task says so), using `visual-storytelling` for imagery and motion.
6. Run `originality-review` on every concept; revise or drop failures.
7. Recommend one concept against the project goals, audience and feasibility. The `recommendationRationale` compares it to the others, not just praises it.
8. Fill `avoided` with rejected directions and style mixes you deliberately excluded; fill `rejectedReferenceIds` with references you rejected via `magec_reference_reject`.
9. Submit with `magec_task_complete`, then send a short handoff via `magec_message_send` to the next agent.

## Constraints
- For scoped work (section/page), stay within the scope and respect `preserve`; do not change the global identity.
- Do not override an accepted user decision; propose changes as `proposed` decisions instead.
- The concept choice is the user's when `conceptSelection` is `user`; present a recommendation, do not decide.

## Validation
- Concepts are substantially different (see `concept-generation`) and each cites reference ids.
- No concept repeats a rejected direction from memory.
- The output parses as `ConceptSet`; `recommendedConceptId` matches a concept.

## Error handling
- Missing visual analysis for a category: proceed with available analyses, record an assumption, and say so in `notes`.
- No verified references at all: generate from brand and product analysis only, set `referenceIds` empty and explain in `originalityNotes`; never cite invented references.
- Contract or claim errors: fix fields and resubmit; after two failures `magec_task_fail` with kind `validation`.

## Related
- `concept-generation`, `reference-synthesis`, `brand-expression`, `originality-review`, `visual-storytelling`.
