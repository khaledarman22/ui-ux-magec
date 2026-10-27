# ui-ux-magec

A local-first, multi-agent UI/UX design system. Give it a product idea (or an existing Figma file). A team
of specialist agents then turns it into native, editable Figma designs:

- product analysis
- real, verifiable reference research
- original creative concepts
- a design system
- the images and icons each page needs (generated, or free-license stock photos and open-source icons)
- the Figma designs themselves, all in auto layout with reusable components, followed by QA and feedback in English or Arabic

Each project's state lives in its own folder (`.ui-ux-magec/`), so work can be resumed, reviewed and deleted
reliably.

It runs inside the coding assistant you already use (**Claude Code**, **OpenAI Codex** or **OpenCode**)
through an MCP server. It can also run autonomously against the Claude API.

## Quick start

```bash
./setup.command                      # macOS/Linux (Windows: setup.cmd). Idempotent; asks before changing anything.
mkdir my-agency-site && cd my-agency-site
ui-ux-magec init "Northlight Agency" --brief "Premium digital marketing agency website" --lang en,ar
cp ~/Downloads/logo.png assets/logos/
ui-ux-magec install-integrations     # optional: project-scoped agents/config for your assistant(s)
```

Then, in your assistant: *"Create a premium digital marketing agency website using this logo."*

### Connecting Figma (one time)

1. In Figma Desktop, go to Plugins → Development → **Import plugin from manifest…** and pick `apps/figma-plugin/manifest.json`.
2. Run **ui-ux-magec bridge** from Plugins → Development. It connects automatically — no token or port to enter.

The plugin carries out a fixed whitelist of validated operations, and only on `127.0.0.1`. There is no code-execution channel.

## Commands

| Command | What it does |
|---|---|
| `init "<name>"` | Creates a new project workspace (always gets a new project ID) |
| `start` / `design` | Plans the workflow (add `--autonomous` to run it with the Claude API) |
| `resume` | Validates and repairs the workspace, recovers interrupted tasks, shows the next work (`--reconcile` checks Figma) |
| `status` | Shows progress, approvals, failures and next tasks |
| `research "<request>"` | Runs scoped research, e.g. `research "creative hero sections"` |
| `audit --mode audit\|suggest\|extend` | Works on an existing Figma file |
| `review` | Runs QA on the designed pages |
| `feedback "<text>"` | Turns English or Arabic feedback into scoped tasks |
| `approve <taskId>` / `retry <taskId>` | Answers an approval / retries a failed task |
| `reset` | Restarts the design process in the same project (archives generated work) |
| `delete` | Permanently deletes the workspace (asks you to type the project name) |
| `doctor` | Checks the installation, configuration, bridge and workspace |
| `bridge serve\|status\|rotate`, `mcp`, `agents`, `skills`, `tasks`, `install-integrations` | Utilities |

## Documentation

- [Architecture](docs/architecture.md)
- [Agents](docs/agents.md)
- [Skills](docs/skills.md)
- [Project workspace](docs/workspace.md)
- [Figma bridge](docs/figma-bridge.md)
- [Research](docs/research.md)
- [Images & icons](docs/assets.md)
- [Platforms & compatibility](docs/platforms.md)
- [Setup](docs/setup.md)
- [Testing](docs/testing.md)
- [Implementation report](IMPLEMENTATION_REPORT.md)

## Status

See [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) for what has been verified and how. In particular,
live Figma writes have only been tested against a mock until the live test is run in your Figma Desktop
(`npm run test:live-figma`).
