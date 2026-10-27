---
name: figma-responsive-layout
description: Produce the full set of breakpoint and direction screens a page needs (desktop/tablet/mobile, LTR/RTL per project settings) from shared structure.
category: specialized
agents: [figma-designer]
tools: [magec_project_context, magec_artifact_read, magec_design_spec_validate, magec_design_spec_save, magec_figma_apply_spec, magec_figma_export_preview, magec_figma_read, magec_message_send]
related: [figma-frame-creation, figma-auto-layout, responsive-patterns, responsive-qa]
---

# Figma responsive layout

## Purpose
Every page is delivered for each breakpoint in `settings.breakpoints` and each direction the project requires.
Screens share section ids and components so they read as one design adapted per context, and QA can check
coverage (`responsive-coverage`) and RTL alignment.

## When to use
- Every `figma-page-design` task.
- When settings add a breakpoint or switch direction to `both`.

## Inputs
- `settings.breakpoints` (default `["desktop", "mobile"]`), project `direction` (`ltr`, `rtl`, `both`), `languages`.
- Token `breakpoints` widths and `grid`; `layoutRules` and component `responsive` notes.
- Arabic copy (from brief/product analysis) when RTL screens are needed.

## Outputs
- One ScreenSpec per breakpoint × direction in the page spec; written frames named `"<Name> — <breakpoint>"` or `"… (RTL)"`.

## Tool requirements
- `magec_design_spec_validate` — catches RTL warnings (Arabic text without Arabic font) and sizing problems.
- `magec_figma_apply_spec` with `screens` to apply one variant at a time if needed.

## Instructions
1. Determine the matrix: breakpoints from settings; directions: `ltr` → LTR only; `rtl` → RTL only; `both` → LTR + RTL.
2. Screen ids: `<page>-<breakpoint>` for the primary direction (LTR, or RTL when the project is RTL-only) and `<page>-<breakpoint>-rtl` for the RTL copy in `both` projects.
3. Keep the same section `id`s across all screens so logical ids align (`screen/home-mobile/hero/...`).
4. Adapt deliberately per `responsive-patterns`: rows become columns on mobile, grids change column count (fixed card widths or `wrap`), navigation collapses to a menu button, secondary content moves or drops, headline steps down one size.
5. Width comes from the breakpoint token (override with `width` only when matching existing frames).
6. RTL screens: set `"direction": "rtl"`, use real Arabic copy, keep logical `start`/`end` alignment. The compiler
   right-aligns `start` text, swaps left/right padding, flips `start`/`end`, and reverses row children. Do not author mirrored coordinates. Directional icons need mirrored SVGs; logos, media controls and numbers do not mirror.
7. Place breakpoints side by side on the page (desktop, tablet, mobile, then RTL row below using `y`).
8. Apply, export a preview of every screen, and compare them side by side for consistency.

## Constraints
- Never scale a desktop frame down to make mobile; rebuild the layout for the width.
- Mobile interactive elements ≥ 44×44 (QA `touch-target`).
- No machine-translated Arabic presented as final copy unless the brief provides it; otherwise mark the text node `placeholder: true` and note it.

## Validation
- Screen set matches the matrix exactly; ids follow the naming pattern.
- RTL previews show right-aligned Arabic, mirrored order and the Arabic font.
- Each breakpoint uses the grid margins from tokens.
- Section ids are identical across the screen set, so QA issues map to the same logical section everywhere.

## Error handling
- Content does not fit mobile: restructure (stack, collapse, truncate with `maxLines`), never shrink body text below 16px.
- Arabic copy missing: placeholder plus a `warnings` entry; ask via `magec_message_send` to `master-orchestrator`.

## Related
- `responsive-patterns` — the rules; `responsive-qa` — how they are checked.
