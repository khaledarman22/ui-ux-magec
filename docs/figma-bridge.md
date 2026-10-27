# Figma bridge

Figma's REST API is read-only for design content. Native editing (frames, auto layout, text, components,
variants, variables, styles) is only possible through the **Plugin API**. ui-ux-magec therefore ships its own
development plugin (`apps/figma-plugin`) and a local WebSocket bridge.

```
runtime (MCP server or CLI) ──ws://127.0.0.1:4517── plugin UI iframe ──postMessage── plugin main (executor) ──► Figma document
```

## Security

- The bridge binds to `127.0.0.1` only and checks the origin.
- **Pairing token, without manual pairing:** a random token is stored in `~/.ui-ux-magec/config.json` (mode
  0600). The plugin build reads it and bakes it, with the port, into `dist/code.js`, so the plugin connects on
  its own and the user never types anything. The bridge still rejects any client without the token (compared in
  constant time). `ui-ux-magec bridge rotate` makes a new token and rebuilds the plugin. `dist/` is git-ignored:
  a built plugin is specific to one machine and must not be shared.
- **Fixed operation whitelist**, validated twice (zod in the runtime, and again in the plugin):
  - `ping`, `get_capabilities`
  - `read_*`, `list_fonts`, `find_by_logical_ids`
  - `ensure_page`, `upsert_tree`, `update_nodes`, `delete_nodes`
  - `upsert_variables`, `upsert_text_styles`, `upsert_paint_styles`
  - `combine_as_variants`, `import_image`, `export_node`

  There is no eval, script or file-system operation.
- **Image imports** only read files from the project's `assets/` folder.
- **`delete_nodes`** requires an authorization ID (an approval the user granted) and deletes only nodes this
  project created.

## Write path (`FigmaWriteCoordinator.applyTree`)

1. **File check:** the plugin must be open in the file linked to the project (adopted on first connection).
2. **Page:** `ensure_page` reuses existing pages rather than duplicating them.
3. **Lock:** a scope lock is taken per page and root.
4. **Recovery:** interrupted operations for these nodes are recovered first.
5. **Idempotency:** if the spec hash and live fingerprint are unchanged, the write is skipped.
6. **Conflict check:** expected fingerprints are sent for every known node. If the user edited any of them in
   Figma, the plugin refuses the whole write *before* mutating anything. The nodes are marked
   `changed-externally`. Overwriting requires an approved approval ID (`overwriteAuthorization`).
7. **Journal:** the journal entry is `pending`, then `confirmed` or `failed`. A timeout stays `pending`, and
   recovery later adopts or abandons it.
8. **Post-write validation:** every logical ID is read back. If any is missing, the write is a failure, not a
   success.
9. **Mappings:** `figma/mappings.json` is updated (logical ID → node ID, fingerprint, spec hash, status).

Nodes carry plugin data (`magec.projectId`, `magec.logicalId`), so retries update existing nodes instead of
duplicating them. Frames the user moved keep their position.

`reconcile` compares mappings with the live file and reports missing or edited nodes. It **never recreates**
deleted designs.

## Spec language

Agents author `DesignSpec` JSON (`packages/schemas/src/design.ts`), using:

- screens with sections
- auto-layout rows and columns
- token references (`$color.primary`, `$typography.h1`, `$spacing.lg`)
- component variants, instances with overrides, and logical alignment (`start`/`end`)

`compileDesign` resolves the tokens, mirrors RTL screens (row order, alignment, padding), switches Arabic text
to the Arabic font and text styles, binds colours to variables, and emits `NodeSpec` trees for the plugin.

## Known limits

- The plugin must be imported once by hand: Figma does not allow installing development plugins
  programmatically.
- The plugin must be open in Figma Desktop while agents write to Figma.
- Variable modes beyond the plan limit, fonts not installed locally (these fall back to Inter and are
  reported) and prototype interactions are not covered.
