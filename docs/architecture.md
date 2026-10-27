# Architecture

```
 user ──► coding assistant (Claude Code / Codex / OpenCode)      or      ui-ux-magec CLI (--autonomous)
              │  master-orchestrator role + specialist subagents             │  AnthropicExecutor (Claude API)
              ▼                                                               ▼
        MCP server (stdio, magec_* tools, as_agent)  ◄──────────────►  MagecRuntime (composition root)
              │
   ┌──────────┼──────────────┬───────────────┬────────────────┬──────────────────┬─────────────┐
 Orchestrator TaskStore     Workspace       ProjectMemory     Research/RefStore   Design engine  Figma coordinator
 (workflows,  (graph, deps,  (.ui-ux-magec,  (decisions,       (fetch+robots,      (tokens, WCAG,  (locks, journal,
  feedback,    locks, retry, atomic writes,  assumptions,       verify, dedup,      compile, RTL)   mappings, recon-
  QA loop)     scheduling)   checkpoints)    feedback)          MMR ranking)                         cile) ──► Bridge (WS 127.0.0.1)
                                                                                                                    │
                                                                                                    Figma plugin (whitelisted ops)
```

## Principles

- **Deterministic core, model at the edges.** Models make the creative and analytical decisions. Everything
  that must be correct is runtime code, with schemas and tests:
  - persistence
  - scheduling
  - permissions
  - deduplication
  - contrast maths
  - spec compilation
  - Figma idempotency
  - conflict detection
  - QA rules
- **The workspace is the source of truth.** Context is rebuilt from `.ui-ux-magec/` (`magec_project_context`),
  never from chat history.
- **Claims are verified.** `magec_task_complete` checks the output against the task's zod contract, then
  checks it against workspace facts:
  - Figma operation journal
  - node mappings
  - reference library
  - preview files

  An agent cannot report Figma nodes, references or previews that do not exist.
- **Auto layout is enforced, not suggested.** The compiler rejects frames with children that lack auto layout,
  `x`/`y` inside auto layout (only `absolute` overlays may be positioned) and copy-pasted sibling structures,
  which must be one (page-level) component with instances. QA re-checks the same rules on the nodes read
  back from Figma.
- **Permissions are separate from skills.** Every tool declares the permissions it needs, and the tool
  registry enforces them for the calling agent (`as_agent`). Loading a skill grants nothing.
- **One writer per scope.** Tasks declare scopes such as `figma:page:<slug>`, and the scheduler never runs two
  overlapping scopes at once. Figma writes also take a scope lock in the workspace.

## Execution modes

| Mode | Who runs the agents | How |
|---|---|---|
| Host-driven (default) | The coding assistant | It calls `magec_*` tools over MCP. Specialists are subagents (Claude Code, OpenCode) or role switches via `magec_agent_brief` (Codex) |
| Autonomous | `AnthropicExecutor` | `ui-ux-magec start --autonomous`. Each task runs an agent loop on the Claude API using only that agent's permitted tools. Model `claude-opus-5-5` (override with `MAGEC_MODEL`), adaptive thinking, effort set by agent tier |

## Packages

| Package | Responsibility |
|---|---|
| `packages/schemas` | zod schemas for every persisted record, task contracts, Figma operations and the bridge protocol |
| `packages/logger` | Structured logs with secret redaction; stdout is reserved for MCP and command output |
| `packages/workspace` | Workspace layout, atomic writes, cross-process locks (queued within a process), manifest hashes, checkpoints, validate/repair/destroy |
| `packages/cache` | TTL, dependency-based invalidation, content hashes; kept separate from memory |
| `packages/memory` | Project memory (decisions, assumptions, feedback), plus global knowledge holding explicit preferences only |
| `packages/task-manager` | Persistent task graph: states, transitions, dependencies, cycle detection, idempotent creation, retries, supersession, scope-aware scheduling |
| `packages/skill-registry` | Skill discovery, validation and on-demand loading |
| `packages/agent-core` | Agent registry, permission-enforcing tool registry, prompts, executors |
| `packages/research` | Source catalog, robots.txt, throttled fetcher, metadata, search providers, query planner, verifier |
| `packages/reference-intelligence` | URL canonicalization, deduplication, provenance, MMR ranking with usage penalty |
| `packages/design-engine` | Colour/WCAG maths, token generation, spec → Figma node compilation (RTL mirroring, Arabic fonts, logical IDs) |
| `packages/figma-bridge` | Config/pairing, WebSocket bridge server and controller, write coordinator, read-only REST client |
| `packages/quality-assurance` | Structural QA rules on read-back nodes, QA loop decisions |
| `packages/orchestration` | Workflows, completion-driven expansion, bilingual feedback routing, approvals, retry/reset, resume, autonomous loop |
| `apps/runtime` | Composition root, 60 MCP tools, claim verification, MCP stdio server, autonomous runner |
| `apps/cli` | `ui-ux-magec` command |
| `apps/figma-plugin` | Figma plugin: injected Plugin API executor plus WebSocket UI |
| `integrations` | Claude Code, Codex and OpenCode generators (never overwrite user files) |

## Workflow (new project)

1. **product-analysis** feeds two tasks:
   - **brand-analysis**
   - **research-plan**, which expands into per-category **research** → **visual-analysis**
2. **concept-generation** follows. If `conceptSelection=user`, a **concept-approval** waits for the user.
3. **design-system** → **figma-foundations** (variables, text styles, components and variants).
4. **asset-sourcing** runs per page (images and icons, see [assets](assets.md)), then **figma-page-design**
   (must/should pages only), then **design-qa**.
5. While QA fails and iterations remain (`maxQaIterations`), it loops **figma-fix** → **design-qa**.
6. **project-summary** comes last.

A checkpoint is written after each stage. Follow-up QA tasks are created *before* a failing QA task is marked
complete, so the summary cannot start early.
