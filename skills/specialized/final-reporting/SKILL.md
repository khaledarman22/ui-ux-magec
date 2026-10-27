---
name: final-reporting
description: Produce the ProjectSummary and the user-facing wrap-up from workspace facts only - what was completed, what is outstanding, limitations and Figma links.
category: specialized
agents: [master-orchestrator]
tools: [magec_project_status, magec_project_context, magec_task_list, magec_task_get, magec_artifact_read, magec_figma_status, magec_reference_list, magec_checkpoint_create, magec_task_start, magec_task_complete, magec_task_fail]
related: [structured-output, progress-reporting, quality-standards, agent-dispatch]
---

# Final reporting

## Purpose
The `project-summary` task closes a workflow and marks the project `completed`. The summary is what the user reads
and what a future session resumes from, so it must be accurate: no unverified claims, no hidden failures, and clear
next steps.

## When to use
- The `project-summary` task is ready (after QA of all designed pages, or after foundations if no pages).
- The user asks for a status report at any point (same method, without completing the task).

## Inputs
- `magec_project_status` (stages, counts, failures, waiting approvals).
- QA reports `reports/qa-<page>-*.json`, Figma write reports `figma/reports/*.json`, `concepts/*.json`, `research/report-*.json`.
- `magec_figma_status` (file link) and decisions/assumptions from `magec_project_context`.

## Outputs
- `ProjectSummary` at `reports/summary.json`: `summary`, `completed`, `outstanding`, `limitations`, `figmaLinks`.

## Tool requirements
- `magec_task_start` / `magec_task_complete` — for the `project-summary` task.
- `magec_artifact_read`, `magec_task_list`, `magec_task_get` — evidence.
- `magec_checkpoint_create` — final snapshot after the summary is accepted.

## Instructions
1. Start the task and list all tasks of the workflow with their final status.
2. `completed`: one entry per real deliverable, e.g. "Product analysis: 14 features (6 must)", "3 concepts; 'Quiet Courtyard' selected by user", "Page home designed (desktop, mobile, RTL); QA passed iteration 2".
3. `outstanding`: failed, cancelled or skipped tasks, unresolved approvals, open blocking questions, `could` features not designed.
4. `limitations`: QA checks skipped and why, references that could not be verified (e.g. Mobbin login-required), missing fonts, assumptions with `high` impact still `open`, visual review not performed.
5. `figmaLinks`: only links from `magec_figma_status` or write reports; never construct node URLs by hand.
6. `summary`: 2-4 sentences in plain language: what was built, for whom, the chosen direction, the state of quality.
7. Complete the task, create a checkpoint, then tell the user the result in their language with the top next steps.

## Constraints
- Report only what workspace artifacts and task records show. A page with failed QA is not "done".
- Do not hide failures or soften them into "minor".
- Keep the summary factual; marketing language and unrequested design opinions do not belong here.

## Validation
- Every `completed` item maps to a completed task or an existing artifact.
- Every failed task appears in `outstanding` or `limitations`.
- The output parses as `ProjectSummary`.

## Error handling
- Missing artifacts for a completed task: list it under `limitations` ("report missing") and do not invent its content.
- Figma disconnected: omit links that cannot be confirmed and say so in `limitations`.
- A QA or page task is still running: do not summarize yet; report progress instead and leave the task ready.

## Related
- `structured-output` — contract submission rules.
- `progress-reporting`, `quality-standards` — tone and definition of done.
