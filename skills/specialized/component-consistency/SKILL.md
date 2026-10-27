---
name: component-consistency
description: Check that screens use the system's components, variants, variables and text styles consistently instead of detached copies or one-off values.
category: specialized
agents: [design-qa-agent]
tools: [magec_qa_run, magec_figma_read, magec_artifact_read, magec_tokens_audit, magec_design_spec_validate]
related: [design-validation, visual-qa, figma-component-creation, component-architecture]
---

# Component consistency

## Purpose
Consistency is what makes a design a system. Structural rules flag off-palette colors (`color-palette`),
off-scale type and spacing (`type-scale`, `spacing-scale`); this skill checks the component layer: instances
versus copies, correct variants, consistent states and the same component looking the same everywhere.

## When to use
- Every `design-qa` task, more deeply on `figma-foundations` output and on pages that introduce new components.

## Inputs
- `design-system/design-system.json` (components, variants, states) and the saved specs in `figma/specs/`.
- Live nodes: `magec_figma_read` `read_node` (types `INSTANCE`, `COMPONENT`, `COMPONENT_SET`), `read_components`, `read_styles`, `read_variables`.
- `magec_qa_run` results for palette/scale rules.

## Outputs
- Issues such as `{ "rule": "component-usage", "severity": "major", "message": "Hero CTA is a FRAME copy of Button, not an instance", "logicalId": "screen/home-desktop/hero/cta", "source": "visual", "suggestion": "Use INSTANCE componentRef button/size-md-variant-primary" }`.

## Tool requirements
- `magec_figma_read` — `read_node` with depth on screens; `read_components` for the component inventory.
- `magec_design_spec_validate` — confirm the spec intended an INSTANCE (helps tell spec bugs from apply bugs).

## Instructions
1. Inventory components and variants in the file; compare with `design-system.json` (missing or extra components).
2. Walk screen trees: elements that look like system components (buttons, inputs, cards, nav) should be `INSTANCE` nodes; FRAME look-alikes are issues (`major` for interactive components, `minor` otherwise).
3. Check variants: the right variant per context (one primary button per section, destructive variant for destructive actions), consistent sizes per breakpoint.
4. Check states exist as variants where the design system lists them (hover, focus, disabled, error).
5. Check styles: text layers use `type/*` styles (Latin) and fills use `color/*` variables; cross-reference `color-palette`, `type-scale`, `spacing-scale` results rather than duplicating them.
6. Check sameness: the same component instance overrides only text/content, not layout or colors, across pages.
7. Existing-file projects: new work must reuse the file's existing components and styles; duplicates of existing components are `major` issues.

## Constraints
- Severity reflects user impact and maintenance risk: detached interactive components `major`, decorative drift `minor`.
- Do not ask for components the design system does not define; report the need as a suggestion instead.
- Do not duplicate structural issues already returned by `magec_qa_run`; reference them.
- Only report what you read from live nodes.
- Detaching or swapping is the designer's job; you only describe the expected reference.

## Validation
- Every reported copy/variant issue has a logicalId or nodeId and the expected component reference.
- Component inventory differences (missing/extra vs `design-system.json`) are listed once, not per screen.
- Findings distinguish spec bugs (spec drew a FRAME) from apply bugs (spec had an INSTANCE), so the right fix is requested.

## Error handling
- Very deep trees: read sections individually (`read_node` on section logicalIds) instead of one huge read.
- Component exists but unreadable (library/remote): note as limitation, do not flag as missing.
- Instance points to a component deleted in Figma: report it as `major`; recreation is a designer/orchestrator decision.

## Related
- `component-architecture`, `figma-component-creation`.
- `design-validation` — assembles the report.
