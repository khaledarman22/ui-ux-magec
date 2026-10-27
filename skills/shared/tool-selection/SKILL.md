---
name: tool-selection
description: Pick the right magec tool (or host tool) for a step, stay within your permissions, and prefer deterministic tools over reasoning.
category: shared
agents: []
tools: [magec_agent_brief, magec_skill_list, magec_skill_load, magec_figma_status, magec_research_sources]
related: [error-handling, workspace-access, source-validation]
---

# Tool selection

## Purpose
The runtime exposes a fixed catalog of `magec_*` tools, each gated by permissions. Agents also have a few
host tools (e.g. Read, WebSearch). Choosing the correct tool avoids permission errors, keeps work attributable
in the journal, and replaces guesswork with deterministic computation.

## When to use
- Before any step where more than one tool could apply.
- When a tool returns a permission error.
- When you are about to compute something by hand (contrast, token ramps, query plans) that a tool computes.

## Inputs
- Your operating brief (`magec_agent_brief`) listing allowed tools and skills.
- Skill metadata (`magec_skill_list`) and bodies (`magec_skill_load`).

## Outputs
- A tool call that your agent is permitted to make, with inputs that match its schema.

## Tool requirements
- `magec_agent_brief` — your allowed tools, skills and instructions.
- `magec_skill_list` / `magec_skill_load` — discover and load skills on demand. Loading grants no permissions.
- `magec_figma_status` — capability check before any Figma operation.
- `magec_research_sources` — access policy of each research source.

## Instructions
1. Prefer deterministic tools for anything measurable:
   - contrast → `magec_contrast_check`; token sets → `magec_tokens_generate`, `magec_tokens_audit`;
   - spec correctness → `magec_design_spec_validate`; live Figma QA → `magec_qa_run`;
   - research queries → `magec_research_plan_queries`; reference ranking → `magec_reference_select`.
2. Context: `magec_project_context` first; `magec_artifact_read` for specific files; `magec_memory_search` for
   decisions. Do not grep the workspace with host tools when a magec tool answers the question.
3. Figma: always `magec_figma_status` before Figma work. Reads use `magec_figma_read` (or
   `magec_figma_snapshot` for a whole-file view). Writes use only `magec_figma_sync_tokens`,
   `magec_figma_apply_spec`, `magec_figma_update_nodes`, `magec_figma_import_image`, and only by the
   figma-designer inside a running task.
4. Research: `magec_research_search` when a search provider is configured; otherwise use the host's
   WebSearch and submit URLs with `magec_research_submit_candidates`. Both paths end in verification by
   retrieval.
5. Outputs: `magec_task_complete` for the primary output; `magec_artifact_write` for supporting files;
   `magec_design_spec_save` for design specs.
6. Load a skill only when its subject applies to the current step; do not preload every skill.
7. If your agent lacks a needed tool, do not search for workarounds. Message the master-orchestrator.

## Constraints
- Only `magec_*` tools listed in your brief are available to you; never invent tool names or parameters.
- Never use host shell or file tools to modify `.ui-ux-magec/` state or the Figma file directly.
- Never use third-party Figma integrations or plugins outside the magec bridge for project work.
- A host tool result (e.g. a WebSearch snippet) is not verification.

## Validation
- Every tool you called is in your brief's allowed list.
- Measurable claims in your output come from a tool result, not estimation.
- Figma writes appear in the operation journal under your task.

## Error handling
- Permission error: you used a tool outside your role. Stop, choose the correct tool, or hand off.
- Schema error on tool input: read the message, fix the field, retry once.
- Tool unavailable (bridge offline, provider missing): fall back as documented (host search for research)
  or fail with kind `external`; see `error-handling`.

## Related
- `error-handling` — classifying tool failures.
- `source-validation` — research tool rules.
- `figma-context-reading` — Figma read tools.
