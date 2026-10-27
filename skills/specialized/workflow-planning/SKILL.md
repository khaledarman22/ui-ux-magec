---
name: workflow-planning
description: Turn a triaged request into a dependency-aware task graph with magec_plan_workflow, adding ad-hoc tasks only when no built-in workflow fits.
category: specialized
agents: [master-orchestrator]
tools: [magec_plan_workflow, magec_task_create, magec_task_list, magec_task_get, magec_project_status, magec_project_context, magec_artifact_read, magec_checkpoint_create]
related: [request-triage, agent-dispatch, dependency-management, checkpoint-management]
---

# Workflow planning

## Purpose
Work in ui-ux-magec runs as a task graph in `tasks/tasks.json`. Built-in workflows (`packages/orchestration/src/workflows.ts`)
already encode the correct order and expand themselves as stages complete. This skill picks the right workflow,
fills its parameters, and adds custom tasks only for gaps, so specialists never start without their inputs.

## When to use
- After `request-triage` returns `new-project`, `research`, `audit` or `review`.
- When the user asks for work no built-in workflow covers (e.g. one extra page after the summary).

## Inputs
- The triage route and its parameters (category, mode, pages).
- `magec_project_status` (completed stages, open tasks) to avoid duplicating work.
- `planning/product-analysis.json` when planning pages or research categories.

## Outputs
- Tasks created in the task graph (returned by `magec_plan_workflow` / `magec_task_create`).

## Tool requirements
- `magec_plan_workflow` — `kind`: `new-project` | `research` | `audit` | `review`; plus `request`, `category`, `mode`, `pages`.
- `magec_task_create` — ad-hoc tasks with `idempotencyKey`, `agent`, `type`, `dependencies`, `params`, `scope`.
- `magec_task_list` / `magec_task_get` — check for existing equivalent tasks first.

## Instructions
1. Check open tasks with `magec_task_list`. If an equivalent task is pending or running, do not create another.
2. Prefer `magec_plan_workflow`. What each kind seeds:
   - `new-project`: product-analysis → brand-analysis + research-plan. When the research plan completes, the runtime expands per category research → visual-analysis → concepts → (concept-approval if `conceptSelection` is `user`) → design-system → figma-foundations → one figma-page-design + design-qa per sitemap page with priority `must`/`should` → project-summary.
   - `research`: research-plan → research → visual-analysis for one `category`.
   - `audit`: figma-snapshot → ux-audit (`mode`); `suggest`/`extend` add research for the gaps.
   - `review`: design-qa for the given `pages` (or all designed pages).
3. Use `magec_task_create` only for gaps. Give every task a stable `idempotencyKey` (`<workflow>:<type>:<scope>`), the owning `agent`, a precise `title`, and `dependencies` by key or task id.
4. Give every Figma-writing task a `scope` (`figma:foundations`, `figma:page:<slug>`) so only one writer touches a scope at a time.
5. Pass constraints through `params` (`category`, `page`, `breakpoints`, `avoidRejected`, `preserve`), not prose alone.
6. After a stage completes (requirements, research, concept, design system, page, QA), create a checkpoint with `magec_checkpoint_create` if the runtime has not already.

## Constraints
- Do not hand-build a pipeline that a built-in workflow already provides; expansion logic would be bypassed.
- Never schedule Figma page design before `figma-foundations`, or concepts before visual analysis.
- `could` pages are not designed by default; add them only when the user asks.
- One writer per Figma scope; never two concurrent tasks with the same `scope`.

## Validation
- Every new task has an owner agent that supports its type (`magec_agent_list`).
- The graph has no cycles and no dependency on a superseded or cancelled task.
- Re-running the same plan creates no duplicates (idempotency keys).

## Error handling
- `magec_plan_workflow` rejects parameters: fix them (e.g. missing `category` for `research`) and retry once.
- A needed input artifact is missing: plan the producing task first instead of letting the consumer fail.

## Related
- `request-triage` — decides which workflow to plan.
- `agent-dispatch` — runs what this skill plans.
- `dependency-management`, `checkpoint-management` — shared rules for ordering and snapshots.
