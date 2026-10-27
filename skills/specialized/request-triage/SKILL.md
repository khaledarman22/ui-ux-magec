---
name: request-triage
description: Classify each user message (English or Arabic) into new project, scoped research, audit, review, feedback, approval answer or status question, and pick the matching entry point.
category: specialized
agents: [master-orchestrator]
tools: [magec_project_status, magec_project_context, magec_project_init, magec_memory_search, magec_figma_status, magec_task_list]
related: [workflow-planning, feedback-routing, approval-handling, context-management]
---

# Request triage

## Purpose
The orchestrator is the user's only interface. Before any work is planned it must know whether a workspace
exists, what the user is actually asking for, and which entry point serves it. Wrong triage produces duplicate
projects, redesigns nobody asked for, or approvals resolved from feedback text.

## When to use
- At the start of every session and on every new user message.
- When a message mixes several requests (e.g. feedback plus a new research question).

## Inputs
- The user's message, in English or Arabic (mixed-language messages are common).
- `magec_project_status` (workspace exists? status, completed stages, approvals waiting, failures).
- `magec_project_context` (brief, decisions, rejected directions, recent feedback).

## Outputs
- A routing decision (not an artifact): one of the routes below, plus any clarification question.

| Route | Signal | Next skill |
|---|---|---|
| `new-project` | no workspace, or an explicit new brief | `workflow-planning` (kind `new-project`) |
| `research` | "find references for property filters", "ابحث عن تصاميم..." | `workflow-planning` (kind `research`, `category`) |
| `audit` | existing Figma file to inspect, improve (`suggest`) or extend | `workflow-planning` (kind `audit`, `mode`) |
| `review` | "QA the home page" | `workflow-planning` (kind `review`, `pages`) |
| `feedback` | opinions or change requests on designed work | `feedback-routing` |
| `approval-answer` | reply to a pending approval or concept choice | `approval-handling` |
| `status` | "where are we?", "وصلنا لفين؟" | `magec_project_status`, answer directly |

## Tool requirements
- `magec_project_status`, `magec_project_context` — always first.
- `magec_project_init` — only when no workspace exists and the user wants a new project.
- `magec_figma_status` — when the request implies an existing Figma file (audit/extend).
- `magec_memory_search`, `magec_task_list` — to check whether the request repeats or contradicts earlier work.

## Instructions
1. Call `magec_project_status`. If it reports no workspace, the request can only be `new-project`, `research` or `audit`; anything else needs a brief first.
2. If a workspace exists, call `magec_project_context` and read approvals waiting. A short reply ("yes", "التاني", "go with B") while an approval is waiting is an approval answer, not feedback.
3. Detect language from the message; keep replying in that language. Do not translate section or page names; map them through the vocabulary in `feedback-routing`.
4. Split compound messages into separate routes and handle them in order: approval answers, then feedback, then new requests.
5. For research requests, name a concrete, feature-level category (`property-filters`, `arabic-product-cards`), not a generic one (`website`).
6. For audit requests, choose `mode`: `audit` (report only), `suggest` (report + researched proposals), `extend` (add new frames next to existing ones).
7. Ask one clarification question only when the route or scope cannot be inferred and a wrong guess would cost work or delete something.

## Constraints
- Never call `magec_project_init` to "restore" or "reset" a project; it always creates a new project id and fails if a workspace exists.
- Never treat a message as approval unless an approval task is actually waiting and the user's words answer it.
- Do not start design work from a status question.

## Validation
- Every user message ends in exactly one route per intent it contains.
- Research categories are specific enough to drive `magec_research_plan_queries`.
- No workspace was initialized over an existing one.

## Error handling
- `magec_project_init` fails because a workspace exists: switch to the existing project and re-triage.
- Figma not connected for an audit: tell the user how to connect (from `magec_figma_status`) and pause the audit route.
- Ambiguous route: ask, quoting the two interpretations you are choosing between.

## Related
- `workflow-planning` — turns the route into a task graph.
- `feedback-routing` — handles the `feedback` route.
- `approval-handling` — handles the `approval-answer` route.
- `context-management` — keeping context compact across turns.
