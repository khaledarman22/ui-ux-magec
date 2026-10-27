# Workspace layout

| Path | Contents | Kind |
| --- | --- | --- |
| `project.json` | Identity, brief, languages/direction, Figma link, settings | state |
| `manifest.json` | Every artifact with hash, producer and task | state |
| `state.json` | Phase, completed stages, last checkpoint, sessions | state |
| `tasks/tasks.json` | Task graph (status, attempts, dependencies, outputs) | state |
| `tasks/messages.jsonl` | Structured inter-agent messages | state |
| `planning/` | Brief, product analysis (features, sitemap, flows), brand analysis | state |
| `research/` | Research plans, reports, visual analyses, query history | state |
| `references/` | Reference metadata (`references.json`) and analyses | state |
| `concepts/` | Creative concepts and selection | state |
| `design-system/` | Tokens and component specifications | state |
| `figma/` | Design specs, node mappings, operation journal, write reports | state |
| `memory/` | Decisions and assumptions (JSONL) | state |
| `feedback/` | User feedback and interpretations | state |
| `reports/` | QA, UX audit and summary reports, previews | state |
| `checkpoints/` | Snapshots of state after completed stages | state |
| `cache/` | Research responses, previews, Figma metadata (safe to delete) | cache |
| `logs/` | Structured JSONL logs (secrets redacted) | logs |
| `locks/` | Cross-process locks | runtime |

Memory and cache are separate: anything under `cache/` may be discarded at any time and is never treated as
authoritative project state.
