---
name: improvement-planning
description: Turn audit gaps into a small, prioritized, scoped list of proposed work that extends the existing design instead of replacing it.
category: specialized
agents: [ux-audit-agent]
tools: [magec_artifact_read, magec_memory_search, magec_decision_record, magec_artifact_write, magec_message_send]
related: [ux-audit, gap-detection, flow-validation, figma-layer-organization]
---

# Improvement planning

## Purpose
Fills `UXAuditReport.proposedWork[]`. In `suggest` mode it drives research for the gaps; in `extend` mode the
orchestrator turns it into design tasks. Good plans are scoped (a page, a flow, a state set), justified by gaps,
and respect what the user already designed.

## When to use
- At the end of `ux-audit` in `suggest` and `extend` modes; optionally in `audit` mode.
- When feedback asks "what should we do next".

## Inputs
- `gaps[]` and `flows[]` from this audit.
- Mode, brief, and memory: accepted decisions and rejected directions (`magec_memory_search`).
- Existing system inventory (components, styles) to reuse.

## Outputs
- `proposedWork[]` items: `{ "title": "Complete checkout error and success states", "page": "checkout", "rationale": "Closes gap-checkout-error and gap-checkout-success; flow is incomplete" }`.
- Optional proposed decisions for direction-level recommendations (`status: "proposed"`).

## Tool requirements
- `magec_decision_record` — only for recommendations that change direction (e.g. "introduce a tablet breakpoint"); status `proposed`.
- `magec_message_send` — notify `master-orchestrator` of blocking critical gaps.

## Instructions
1. Group gaps by scope: same page, same flow, or same component.
2. Order by impact: critical first, then major gaps on `must` flows, then accessibility, then consistency, then polish.
3. Write one item per scope with a short imperative title, `page` slug (sitemap slug) when page-scoped, and a rationale citing gap ids.
4. State how it extends existing work: "reuse existing Button/Input variants; add frames next to current Checkout frames"; in extend mode new work never modifies existing frames in place.
5. Keep the list short (typically 3–8 items). Merge trivial polish into one item.
6. Mark items needing user input (e.g. missing copy, brand change) in the rationale.
7. Never propose redoing pages that work; if a redesign seems justified, propose it as a decision for the user, not as work.

## Constraints
- Every item traces to at least one gap or incomplete flow.
- No item contradicts accepted decisions or revives rejected directions.
- Scope is design work only; do not plan code.
- Do not create tasks yourself; the orchestrator schedules work from this list.
- Proposals are suggestions: nothing in the list is applied without the workflow or user approving it.

## Validation
- All critical gaps are covered by some item.
- Each `page` value matches a sitemap slug or an existing Figma page.
- Items are independent enough to become separate tasks with their own scope.

## Error handling
- Gaps conflict with an accepted decision: list the conflict in the rationale and leave the decision to the user.
- Too many gaps for one round: plan the top items and add a final item "Remaining minor polish (n gaps)".

## Related
- `ux-audit`, `gap-detection`, `flow-validation`.
