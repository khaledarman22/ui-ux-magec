---
name: figma-frame-creation
description: Author ScreenSpecs and apply them as native, editable Figma frames through magec_figma_apply_spec, idempotently and without disturbing existing work.
category: specialized
agents: [figma-designer]
tools: [magec_task_start, magec_task_complete, magec_figma_status, magec_figma_read, magec_design_spec_validate, magec_design_spec_save, magec_figma_apply_spec, magec_figma_export_preview, magec_artifact_read, magec_project_context, magec_task_fail]
related: [figma-auto-layout, figma-component-creation, figma-responsive-layout, figma-layer-organization, figma-node-editing]
---

# Figma frame creation

## Purpose
Screens are written as a `DesignSpec` (`packages/schemas/src/design.ts`), compiled with project tokens
(`packages/design-engine/src/compile.ts`) and upserted into Figma as real frames, auto layout, text layers and
instances. Every node gets a stable `logicalId`, so re-applying a spec updates nodes instead of duplicating them.
Output is never a flattened image.

## When to use
- `figma-page-design` tasks (one page, all required breakpoints/directions).
- Adding a new screen or state frame next to existing ones.

## Inputs
- Running task from `magec_task_start` (its `taskId` is required by every write tool).
- `design-system/design-system.json`, accepted concept, `planning/product-analysis.json` (page sections, states).
- Project `direction`, `settings.breakpoints`, `settings.themes` (`magec_project_context`).
- Existing frames on the target page: `magec_figma_read` `{ "op": "read_document", "includeFrames": true }`.

## Outputs
- Saved spec `figma/specs/<name>.json` (`magec_design_spec_save`).
- `FigmaWriteReport` via `magec_task_complete`: `specPath`, `operationIds`, `nodes[{logicalId,nodeId,action}]`, `previews`, `warnings`, `unsupported`.

## Tool requirements
- `magec_figma_status` — bridge connected and `fileMatches` true before any write.
- `magec_design_spec_validate` → `magec_design_spec_save` → `magec_figma_apply_spec` (`taskId`, `specPath`, optional `screens`, `includeComponents`, `pageSuffix`).
- `magec_figma_export_preview` — PNG of each written screen for QA.

## Instructions
1. `magec_task_start`; then `magec_figma_status`. Stop if not connected or the file does not match.
2. Name screens `<page-slug>-<breakpoint>` (e.g. `home-desktop`); add `-rtl` for the RTL copy when direction is
   `both`. QA coverage and `magec_qa_run` page filters rely on this pattern.
3. Write one ScreenSpec per breakpoint/direction. Minimal shape:
   ```json
   { "specVersion": 1, "conceptId": "calm-precision", "screens": [{
       "id": "home-mobile", "name": "Home", "page": "Home", "breakpoint": "mobile", "direction": "ltr",
       "theme": "light", "background": "$color.background", "gap": "$spacing.2xl",
       "sections": [{ "id": "hero", "name": "Hero", "layout": { "direction": "column", "gap": "$spacing.md", "padding": "$spacing.lg" },
         "children": [{ "id": "title", "type": "TEXT", "name": "Hero / Title", "text": "Find a home near family", "textStyle": "$type.h1" }] }] }] }
   ```
   `width` defaults to the breakpoint token; sections default to `width: "fill"`; the frame is vertical auto layout and hugs height unless `minHeight` is set.
4. Placement: within one spec, screens on the same page are placed left to right with 160px gaps. When the page
   already has frames, set `x`/`y` explicitly to the right of the right-most existing frame. Existing top-level frames keep their position on update.
5. Validate; fix every error (unknown token, TEXT without `textStyle`, INSTANCE without `componentRef`, duplicate child ids). Read warnings (fill without auto-layout parent, Arabic without Arabic font).
6. Save, then apply with `specPath`. Use `screens: [...]` to apply only what changed.
7. Export a preview per screen (`logicalId: "screen/<id>"`, `name: "<id>"`) and look at it before completing.
8. Complete with nodes and operation ids exactly as returned.

## Constraints
- Writes need a running task you own; never write outside one.
- Never place screenshots/flattened images as design; images only for real photos/illustrations.
- Never modify existing user frames to "make room"; add new frames beside them.
- Keep `pruneOwnedChildren: false` unless an approved removal applies (see `figma-node-editing`).
- Use token refs, not raw hex/px, except where no token exists (then note it in `warnings`).

## Validation
- Apply result `summary` matches expectations; `missingFonts` is empty.
- Preview shows text, layout and content as intended for each screen.
- Report contains only ids returned by the tools.

## Error handling
- `conflict`: nodes were edited in Figma; follow `figma-node-editing` (approval or new frame). Never retry blindly.
- `locked`: another task writes this scope; wait and retry once, else report.
- `not_connected` / file mismatch: `magec_task_fail` kind `external` with the bridge detail.
- Compile errors: fix the spec; they name the exact logicalId.

## Related
- `figma-auto-layout`, `figma-responsive-layout`, `figma-layer-organization`, `figma-component-creation`.
