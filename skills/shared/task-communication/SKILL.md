---
name: task-communication
description: Communicate with other agents and the user through structured, task-attached messages and approvals instead of free-form chat.
category: shared
agents: []
tools: [magec_message_send, magec_task_get, magec_project_context, magec_approval_request]
related: [project-memory, progress-reporting, dependency-management]
---

# Task communication

## Purpose
Agents do not share a conversation. Everything one agent needs from another travels through the workspace:
task outputs, messages attached to tasks, and approval tasks for the user. This skill keeps those hand-offs
explicit, short and traceable.

## When to use
- Handing results or caveats to the next agent in the pipeline.
- Asking a question that blocks or changes your work.
- Requesting a revision from the agent that produced an input.
- Needing a decision that belongs to the user.

## Inputs
- Messages addressed to you (shown under "Messages for you" in `magec_project_context`).
- The task you are working on (`taskId`) and the artifacts you reference.

## Outputs
- Messages with `to` (agent id), `kind` (`handoff`, `question`, `answer`, `result`, `revision-request`, `note`),
  a concise `body`, `taskId` and `artifactRefs`.
- Approval tasks created with `magec_approval_request` when the user must decide.

## Tool requirements
- `magec_message_send` — structured agent-to-agent messages.
- `magec_task_get` — find the producer of an input (dependencies, agent).
- `magec_project_context` — read messages addressed to you.
- `magec_approval_request` — only for agents with `approvals.request`.

## Instructions
1. Read incoming messages at task start and address any `question` or `revision-request` that concerns your
   task.
2. Prefer the task output itself as the hand-off. Send a `handoff` message only for things the output schema
   cannot carry (e.g. "hero copy is placeholder pending client text").
3. Write message bodies as: what, where (artifact path / logical id), and what you need. Two to five sentences.
4. Always attach `taskId` and the relevant `artifactRefs` so the receiver can verify instead of trusting.
5. Use `revision-request` to the producing agent when an input is wrong; describe the defect and evidence.
   Do not silently rewrite another agent's artifact.
6. Route user-owned decisions (concept choice, destructive changes, overwriting user-edited Figma nodes, brand
   changes) through `magec_approval_request` with a clear `title`, `subject`, `scope` and `destructive` flag.
   If you lack that permission, send a `question` to `master-orchestrator`.
7. After requesting an approval, do not wait inside your task. Finish what does not depend on it, report
   what is pending, and complete or fail the task.

## Constraints
- Never answer an approval on the user's behalf. Only the master-orchestrator records answers, and only after
  the user explicitly replied.
- Never put secrets, credentials or large data dumps in messages.
- Do not use messages to bypass the task graph (e.g. "please also redesign the footer"); ask the
  master-orchestrator to create a task instead.
- Address agents by their exact id (`figma-designer`, `design-qa-agent`, ...); see `magec_agent_list`.

## Validation
- Every message has a `taskId` and points to evidence.
- Questions are specific enough to be answered in one reply.
- No approval was assumed or self-granted.

## Error handling
- Unknown recipient: check `magec_agent_list` for the right id.
- A question blocks your task and has no answer yet: complete with what you have plus `openQuestions`, or fail
  with kind `external` and `retryable: true` if no meaningful output is possible.
- Conflicting instructions from two agents: follow the task brief and accepted decisions; ask the
  master-orchestrator.

## Related
- `progress-reporting` — reporting status rather than conversing.
- `dependency-management` — who produces what.
- `project-memory` — recording what was agreed.
