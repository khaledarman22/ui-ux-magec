# Setup

```bash
./setup.command            # macOS/Linux; double-click in Finder works too
setup.cmd                  # Windows
node scripts/setup.mjs --dry-run           # show what would happen
node scripts/setup.mjs --yes               # accept every prompt
node scripts/setup.mjs --non-interactive   # decline anything that needs consent
```

## Steps

Every step is idempotent.

1. Check for Node.js 20 or newer. It is not installed for you.
2. Run `npm install` if dependencies are missing or out of date.
3. `npm run build`: compiles the TypeScript packages and builds the Figma plugin with the configured port.
4. Create `~/.ui-ux-magec/config.json` (bridge port plus a random pairing token, mode 0600) if absent. An
   existing token is kept. The token is never printed.
5. Detect `claude`, `codex` and `opencode`. For each one found, show the exact files or commands, then ask:
   - Claude Code: `claude mcp add --scope user …` plus `~/.claude/agents/magec-*.md` and the entry skill
   - Codex: a marked block in `~/.codex/config.toml` plus `~/.codex/AGENTS.md`
   - OpenCode: an `mcp` entry plus agents in `~/.config/opencode`
6. Offer `npm link` so the `ui-ux-magec` command is available everywhere.
7. Print the one-time Figma plugin import steps, then run `ui-ux-magec doctor`.

Secrets are read from the environment and never written to files by setup:

- `ANTHROPIC_API_KEY` (autonomous mode)
- `BRAVE_SEARCH_API_KEY` (runtime web search)
- `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` (optional stock-photo search for the asset agent)
- `FIGMA_TOKEN` (optional read-only REST)

Other variables:

- `MAGEC_HOME` moves the global config.
- `MAGEC_BRIDGE_PORT` and `MAGEC_BRIDGE_TOKEN` override the bridge settings.
- `MAGEC_MODEL` overrides the autonomous model.
