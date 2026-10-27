# Testing

```bash
npm test                    # everything (vitest; sources resolved directly, no build needed except 2 binary checks)
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:live-figma     # LIVE: needs Figma Desktop with the plugin open and paired
```

## What is mocked

Every mock is labelled `MOCK` in its header.

| Mock | Stands in for | Used by |
|---|---|---|
| `tests/helpers/fake-figma.ts` | Figma Plugin API (in-memory document) | Plugin executor, coordinator and e2e tests: the real executor runs against it |
| `tests/helpers/fake-transport.ts` | Bridge plus plugin, in-process, with fault injection | Coordinator and e2e tests |
| `tests/helpers/sim-plugin.ts` | The plugin's WebSocket client | Bridge tests (real WebSocket server) |
| `mockWeb` / `mockFetch` | The internet | Research and e2e tests |
| `ScriptedAgents` | LLM agents (canned outputs through the real tools) | e2e scenarios |

## Coverage of the required test areas

| Requirement | Test |
|---|---|
| Agent registration | `unit/registry.test.ts` |
| Skill discovery | `unit/registry.test.ts` |
| Shared skill resolution (scenario G) | `unit/registry.test.ts` |
| Permission enforcement | `unit/permissions.test.ts` |
| Agent task handoff | `integration/handoff.test.ts` |
| Task dependency ordering | `unit/tasks.test.ts` |
| Task status persistence | `unit/tasks.test.ts` |
| Workspace initialization | `unit/workspace.test.ts` |
| Workspace resume | `unit/workspace.test.ts`, `e2e/scenarios.test.ts` (D) |
| Cache invalidation | `unit/cache.test.ts` |
| Reference deduplication | `unit/references.test.ts` |
| Research source validation | `unit/research.test.ts` |
| Figma operation schemas | `unit/figma-schemas.test.ts` |
| Figma node mapping | `integration/figma-coordinator.test.ts` |
| Duplicate-write prevention | `integration/figma-coordinator.test.ts`, `unit/plugin-executor.test.ts` |
| Conflict detection | `integration/figma-coordinator.test.ts`, `unit/plugin-executor.test.ts` |
| Interrupted operations | `integration/figma-coordinator.test.ts` |
| Deleted project handling | `unit/workspace.test.ts`, `e2e/scenarios.test.ts` (F) |
| User feedback processing | `unit/feedback.test.ts`, `e2e/scenarios.test.ts` (E) |
| Setup idempotency | `integration/setup.test.ts` |
| Auto layout and component rules | `unit/design-engine.test.ts`, `unit/qa.test.ts`, `e2e/scenarios.test.ts` (A) |
| Images, icons, licenses, SVG safety | `unit/assets.test.ts`, `e2e/scenarios.test.ts` (A) |
| Live Figma frame creation | `e2e/figma-live.test.ts` (skipped and reported **UNVERIFIED** unless `MAGEC_LIVE_FIGMA=1`) |

Acceptance scenarios A, B, C, D, E, F and H run end to end in `e2e/scenarios.test.ts` (mocked agents, web and
Figma; real orchestrator, tools, workspace, compiler, coordinator and plugin executor). G is in
`unit/registry.test.ts`. The scripted agents decide nothing creative; these tests check the system's
mechanics and guarantees, not design quality.
