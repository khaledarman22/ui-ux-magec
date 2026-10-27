---
name: figma-variables
description: Sync design tokens into Figma as variables (colors per theme mode, spacing, radius) and text styles, and make specs bind to them; reuse existing variables when extending a file.
category: specialized
agents: [figma-designer]
tools: [magec_task_start, magec_figma_status, magec_figma_read, magec_figma_sync_tokens, magec_artifact_read, magec_tokens_audit, magec_design_spec_validate, magec_message_send, magec_task_fail]
related: [design-token-generation, figma-component-creation, figma-frame-creation]
---

# Figma variables

## Purpose
Variables and text styles are how tokens live inside Figma. `magec_figma_sync_tokens` creates or updates them
idempotently from `design-system/design-system.json`; specs that use token refs then produce fills bound to
`color/<name>` variables and text bound to `type/<name>` styles, so a token change updates the whole design.

## When to use
- First step of every `figma-foundations` task, before components and screens.
- After the design system changes tokens (re-sync, then re-apply affected specs).

## Inputs
- Running task id.
- `design-system/design-system.json` (`tokens`), validated by design-system-agent.
- Existing variables/styles in the file: `magec_figma_read` `{ "op": "read_variables" }`, `{ "op": "read_styles" }`.

## Outputs
- Variable collection `"<project name> tokens"` (or with ` — <collectionSuffix>`), modes `light` + every key in `tokens.themes`.
- Variables `color/<name>` (COLOR), `spacing/<name>`, `radius/<name>` (FLOAT).
- Text styles `type/<name>`; when `fonts.arabic` is set, also `type-ar/<name>` (Arabic family, line height ×1.1).
- Returned `operationIds` go into the `FigmaWriteReport`.

## Tool requirements
- `magec_figma_sync_tokens` — `{ taskId, collectionSuffix? }`; idempotent, journaled.
- `magec_tokens_audit` — sanity check before syncing (contrast regressions).

## Instructions
1. `magec_figma_status`; confirm connection and file match.
2. Read existing variables and styles. If the file already has a token collection or text styles from the user,
   do not create a competing system: report the overlap to `design-system-agent` (`magec_message_send`) so tokens can adopt existing names, then sync.
3. Run `magec_tokens_audit` on the tokens; do not sync a set with unresolved AA failures — report back instead.
4. Call `magec_figma_sync_tokens` with the running `taskId`. Use `collectionSuffix` only for a deliberately separate set (e.g. a proposal in extend mode).
5. Verify with `magec_figma_read` `read_variables` / `read_styles` that names and modes exist.
6. In specs, always reference tokens (`"fill": "$color.surface"`, `"textStyle": "$type.body"`); raw hex produces unbound fills that QA flags (`color-palette`).
7. Arabic text nodes compile with the Arabic family; a `type/*` style is bound only when its family matches the node font, so Arabic layers carry the font directly. Mention this in `warnings` if the user expects `type-ar/*` bound.

## Constraints
- Never delete or rename existing variables or styles.
- Sync only from the saved design system; do not hand-edit token values in Figma.
- Writes require a running task you own.

## Validation
- Collection modes equal `["light", ...themes]`.
- Count of `color/*` variables equals the number of `tokens.color` keys.
- `type/*` styles exist for every typography token; fonts load without "unavailable" warnings.

## Error handling
- `unsupported_operation` adding a mode (Figma plan limits): report the limitation in `unsupported`, keep the light mode, and continue.
- Missing font while creating text styles: report the family; it would be replaced by Inter and fail QA `missing-font`.
- `not_connected`: `magec_task_fail` kind `external`.

## Related
- `design-token-generation` — source of the tokens.
- `figma-component-creation` — consumes the bound variables and styles.
