---
name: design-system-planning
description: Run the design-system task end to end and deliver a consistent DesignSystemSpec (tokens, components, layout, accessibility and RTL rules) to design-system/design-system.json.
category: specialized
agents: [design-system-agent]
tools: [magec_task_start, magec_task_complete, magec_task_fail, magec_project_context, magec_artifact_read, magec_memory_search, magec_decision_record, magec_assumption_record, magec_tokens_audit, magec_design_spec_validate, magec_figma_status, magec_figma_snapshot, magec_message_send, magec_checkpoint_create]
related: [design-token-generation, component-architecture, responsive-patterns, accessibility-guidelines, brand-guidelines]
---

# Design system planning

## Purpose
Orchestrates the design-system-agent's own work for a `design-system` task: gather inputs, produce tokens and
components, write layout/accessibility/RTL rules, validate, and complete with the `DesignSystemSpec` contract.
The result is what `magec_figma_sync_tokens` and every design spec compile against.

## When to use
- When a `design-system` task is assigned to you.
- When feedback requires a system-wide change (density, theme, font).

## Inputs
- `magec_task_start` brief and params.
- `planning/brand-analysis.json`, accepted concept in `concepts/`, `planning/product-analysis.json`.
- Project `languages`, `direction`, `settings.breakpoints`, `settings.themes` (`magec_project_context`).
- Existing Figma file state (extend mode): `figma/snapshot.json`, `magec_figma_status`.

## Outputs
`DesignSystemSpec` via `magec_task_complete` (written to `design-system/design-system.json`):
`tokens`, `components[]`, `layoutRules[]`, `accessibilityRules[]`, `rtlRules[]`.

## Tool requirements
- `magec_tokens_audit` — final audit before completion.
- `magec_design_spec_validate` — compile a tiny probe spec to prove tokens resolve.
- `magec_figma_snapshot` — only when extending a file and no fresh snapshot exists.

## Instructions
1. `magec_task_start`; read the brief, brand analysis, accepted concept (check `magec_memory_search` for which concept was accepted) and product analysis.
2. If the project extends an existing Figma file, inventory variables, styles and components first (snapshot); plan to reuse them.
3. Produce tokens (`design-token-generation`).
4. Produce components (`component-architecture`).
5. Write `layoutRules`: grid per breakpoint, section vertical rhythm (e.g. `$spacing.3xl` between sections desktop,
   `$spacing.2xl` mobile), max content width, card grids per breakpoint (`responsive-patterns`).
6. Write `accessibilityRules` (`accessibility-guidelines`) and `rtlRules` (mirroring, logical alignment,
   non-mirrored icons, Arabic font usage) when `direction` is `rtl` or `both`.
7. Validate: `magec_tokens_audit` passes; probe spec compiles with `magec_design_spec_validate`, e.g. a screen
   using `$color.background`, `$type.h1`, `$spacing.lg`, `$radius.md`.
8. Complete with `magec_task_complete`. Send a handoff to `figma-designer` via `magec_message_send` listing
   new components, reused existing ones, and any renamed tokens.
9. Create a checkpoint (`stage: "design-system"`) after acceptance.

## Constraints
- Consistency over novelty: one spacing scale, one type scale, one radius set.
- Do not contradict accepted brand decisions; record new system-level choices with `magec_decision_record`.
- No Figma writes; you prepare changes, figma-designer performs them.
- Keep rules testable ("Body text ≥ 16px on desktop"), not aspirational ("Text should be readable").

## Validation
- Schema passes; every component's anatomy references only existing tokens.
- Every breakpoint in settings has a grid and at least one layout rule.
- RTL rules exist whenever Arabic or RTL is in scope.

## Error handling
- Missing brand analysis: record an assumption and build from the concept; flag in `notes`.
- Concept not yet accepted: ask `master-orchestrator` via `magec_message_send` (kind `question`); if the task cannot proceed without it, call `magec_task_fail` with kind `validation` naming the missing dependency.
- Schema errors: fix named fields and resubmit.

## Related
- `design-token-generation`, `component-architecture`, `responsive-patterns`, `accessibility-guidelines`.
- `figma-variables` — consumes the result.
