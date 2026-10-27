# Project workspace

`ui-ux-magec init` creates the following inside the project folder:

```
README.md                 human overview
assets/
  logos/                  the user's logos
  images/                 photos: the user's, generated, or free-license stock
  icons/                  open-source icons (SVG)
  references/             saved reference images (inspiration only, never placed in designs)
  assets.json             provenance of every file: source, author, license, or generation prompt
.ui-ux-magec/
  project.json            identity (projectId), brief, languages, direction, settings, Figma link
  state.json              completed stages, last checkpoint, sessions
  manifest.json           every artifact with its hash, producer and task
  planning/               brief.md, product-analysis.json, brand-analysis.json, redesign plans
  tasks/                  tasks.json (task graph), messages.jsonl (agent messages)
  research/               plan-*.json, report-*.json, visual-analysis-*.json, queries.jsonl
  references/             references.json (library and provenance), analyses/*.json
  concepts/               concept sets
  design-system/          design-system.json (tokens, components, rules)
  figma/                  specs/*.json, reports/*.json, mappings.json, operations.jsonl (journal), snapshot.json, reconcile.json
  memory/                 decisions.jsonl, assumptions.jsonl, feedback.jsonl (append-only, folded to latest)
  feedback/               approval records
  reports/                QA and UX audit reports, previews/*.png, summary.json
  checkpoints/<id>/       copies of state files, plus a task snapshot
  cache/                  disposable (search results, previews, robots.txt, Figma metadata)
  logs/                   JSONL logs with secrets redacted
  locks/                  cross-process locks
  archive/<timestamp>/    artifacts moved aside by `reset`
```

## Integrity

- **Atomic writes:** every write goes to a temp file, is fsynced, then renamed.
- **Locks:** created with `open(…,'wx')`, with stale detection by TTL and dead PID. Callers within the same
  process are queued so concurrent MCP requests cannot interleave.
- **Validation:** the manifest hashes expose edits made outside the runtime. `resume` and `doctor` run `validate`.
- **Repair:** `repair` recreates missing directories, clears stale locks and removes orphaned temp files. It
  never rewrites project data.

## Operations that are deliberately distinct

| Operation | Effect |
|---|---|
| retry | Re-queues a *failed* task with the same inputs (`ui-ux-magec retry`) |
| redesign | Feedback-driven new work. Rejected directions are recorded and never repeated, and unrelated work is preserved |
| reset | Same project: archives generated artifacts, supersedes tasks and clears stages. Keeps the brief, assets, memory and Figma mappings |
| delete | Removes `.ui-ux-magec/` (and `assets/` with `--include-assets`). There is no hidden copy and no automatic restoration; a new `init` creates a new independent project ID |

## Cache vs memory

The cache is disposable and can be pruned or cleared at any time. Memory holds decisions, assumptions and
feedback, and is the project's history.

Global data (`~/.ui-ux-magec/`) contains only:

- the bridge config
- preferences you explicitly asked to keep globally
- optional reference usage counts, kept only if you enable them

It never holds project briefs, designs or research.
