---
name: context-management
description: Rebuild the working context for a task from the workspace (never from chat history) and keep it small, current and relevant.
category: shared
agents: []
tools: [magec_project_context, magec_task_get, magec_artifact_read, magec_memory_search]
related: [workspace-access, project-memory, figma-context-reading]
---

# Context management

## Purpose
Agents in ui-ux-magec run in separate sessions, on different hosts, and may be resumed days later. The only
reliable shared state is the project workspace (`.ui-ux-magec/`). This skill makes every agent reconstruct its
context from that workspace, read only what the task needs, and never act on remembered chat that the
workspace does not confirm.

## When to use
- At the start of every task, right after `magec_task_start`.
- After a resume, a long pause, or when you suspect your picture of the project is stale.
- Before contradicting, extending or repeating earlier work.

## Inputs
- The task brief from `magec_task_start` (instructions, `params`, `inputRefs`, output contract, context pack).
- `magec_project_context` with your `taskId`: project settings, completed stages, active decisions, rejected
  directions, open assumptions, recent feedback, messages addressed to you, and the 25 most recent artifacts.

## Outputs
- A working understanding limited to what the task needs; no artifact of its own.
- Facts you rely on are traceable to a workspace path, decision id, reference id or Figma mapping.

## Tool requirements
- `magec_project_context` — the canonical context pack (pass `taskId`).
- `magec_task_get` — full task details: params, dependencies, previous errors and attempts.
- `magec_artifact_read` — read the specific input artifacts listed in `inputRefs`.
- `magec_memory_search` — targeted lookups of decisions, assumptions and feedback by keyword.

## Instructions
1. Call `magec_project_context` with your `taskId`. Treat it as the authoritative summary.
2. Read every path in the task's `inputRefs` with `magec_artifact_read`. Read other artifacts only when the
   task clearly depends on them (e.g. the accepted concept for a design-system task).
3. Note the **rejected directions** list. Anything on it must not be proposed again in this scope.
4. Note **active decisions** and their status. `accepted` decisions bind you; `proposed` ones are not yet
   approved by the user and must not be treated as final.
5. If `magec_task_get` shows earlier attempts, read their errors first so you do not repeat the same failure.
6. Use `magec_memory_search` for anything specific (e.g. `"hero"`, `"arabic font"`) instead of reading whole
   memory files.
7. Keep a short mental list of the ids and paths you will cite in your output (see `structured-output`).
8. If the brief and the workspace disagree, trust the workspace and mention the discrepancy in `notes`.

## Constraints
- Never use chat history or a previous session's recollection as a source of truth. If it is not in the
  workspace, it did not happen.
- Do not load large artifacts "just in case"; use `maxChars` on `magec_artifact_read` for large files.
- Cache entries (`cache/`) are not context. They are disposable and may be stale or absent.
- Do not read other projects' workspaces; global knowledge holds only explicitly saved preferences.

## Validation
- Every decision, rejected direction or assumption you act on appears in `magec_project_context` or
  `magec_memory_search` results.
- Every input path you cite exists (re-read with `magec_artifact_read` if unsure).
- Your output does not reintroduce a rejected direction for the same scope.

## Error handling
- `magec_project_context` fails or returns no project: stop and call `magec_task_fail` with kind `technical`;
  do not guess project facts.
- An `inputRefs` artifact is missing: check whether the producing task completed (`magec_task_get` on its
  dependency). If it did not, fail with kind `validation` and say which input is missing.
- Conflicting decisions for the same scope: follow the newest `accepted` one, and report the conflict.

## Related
- `workspace-access` — where things live and what you may write.
- `project-memory` — decisions, assumptions and rejected directions.
- `figma-context-reading` — context that lives in Figma rather than in files.
