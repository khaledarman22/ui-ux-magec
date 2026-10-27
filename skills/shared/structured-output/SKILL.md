---
name: structured-output
description: Produce task outputs that validate against the task's output contract on the first try, and report only work that actually happened.
category: shared
agents: []
tools: [magec_task_start, magec_task_complete, magec_task_fail, magec_artifact_read]
related: [error-handling, quality-standards, workspace-access]
---

# Structured output

## Purpose
Every task in ui-ux-magec ends with a machine-validated artifact. The runtime parses the output with the task's
zod contract (`TASK_CONTRACTS` in `packages/schemas/src/contracts.ts`) and cross-checks claims against workspace
facts (Figma operation journal, node mappings, reference library, preview files). This skill makes that
hand-off succeed without retries and without overstating results.

## When to use
- Whenever you finish a task and call `magec_task_complete`.
- When `magec_task_complete` returns `accepted: false` with schema or claim errors.

## Inputs
- The `outputContract` returned by `magec_task_start` (`schema` name and `artifactPath`).
- The schema definition in `packages/schemas/src/contracts.ts` (read it with your file tools if you are unsure of a field).
- The work you actually performed in this task.

## Outputs
- A single JSON object passed as `output` to `magec_task_complete`. The runtime writes it to `artifactPath`.

## Tool requirements
- `magec_task_start` — returns the contract and context.
- `magec_task_complete` — validates and stores the output.
- `magec_task_fail` — when the work genuinely could not be done.

## Instructions
1. Read the contract name returned by `magec_task_start` before you start working, so you collect the evidence the contract needs (ids, paths, sources) as you go.
2. Build the output object field by field from real results: ids returned by tools, paths that exist, numbers you measured.
3. Put uncertainty in the fields designed for it (`assumptions`, `openQuestions`, `limitations`, `warnings`) instead of omitting or inventing data.
4. Use stable, lowercase kebab-case ids for things you name yourself (pages, sections, concepts).
5. Call `magec_task_complete` once. If it returns `accepted: false`, read every error, fix the output (not the facts), and call it again.
6. Add a short `notes` string when the orchestrator needs to know something that does not fit the contract.

## Constraints
- Never report Figma nodes, operation ids, references or previews that a tool did not return to you in this task or that are not in the workspace.
- Never mark a check as passed if it was not executed; mark it skipped with the reason.
- Do not write task outputs with `magec_artifact_write`; that bypasses validation.
- Keep free-text fields concise; long prose belongs in a separate notes artifact.

## Validation
- The output parses against the named schema (the runtime enforces this).
- Every id and path in the output can be found again with `magec_artifact_read`, `magec_reference_list` or the Figma mapping table.
- Limitations are stated explicitly when something could not be verified.

## Error handling
- Schema errors: fix the listed paths; the error messages name the exact field.
- Claim errors (e.g. "node was never written through the bridge"): remove the false claim or do the missing work, then resubmit.
- If after two corrections the output still cannot be accepted, call `magec_task_fail` with kind `validation` and explain why.

## Related
- `error-handling` — classifying failures.
- `quality-standards` — what "done" means for design work.
- `workspace-access` — where artifacts live.
