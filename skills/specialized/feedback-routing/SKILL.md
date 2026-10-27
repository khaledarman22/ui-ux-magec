---
name: feedback-routing
description: Turn English or Arabic user feedback into correctly scoped work (section, page, breakpoint, design system or project) through magec_feedback_submit, without touching unrelated parts.
category: specialized
agents: [master-orchestrator]
tools: [magec_feedback_submit, magec_project_context, magec_memory_search, magec_artifact_read, magec_artifact_write, magec_task_list, magec_task_start, magec_task_complete, magec_task_fail, magec_decision_record]
related: [request-triage, approval-handling, user-feedback-processing, project-memory]
---

# Feedback routing

## Purpose
Feedback is the main way users steer designs. Each message must change exactly what the user meant: a scoped
section refinement must not trigger a project redesign, and a rejected direction must never come back.
`magec_feedback_submit` records the feedback, rejects superseded decisions and creates the scoped tasks; this skill
makes sure the interpretation it acts on is right.

## When to use
- `request-triage` routed a message as `feedback`.
- A `feedback-interpretation` task is assigned to you (rule-based parser returned `general` or low confidence).

## Inputs
- The user's exact words.
- Vocabulary: sitemap page slugs/names and section ids from `planning/product-analysis.json`.
- `magec_project_context` (accepted and rejected decisions, recent feedback).

## Outputs
- Recorded feedback plus created tasks (from `magec_feedback_submit`).
- For `feedback-interpretation` tasks: a `FeedbackInterpretation` (`intent`, `scope { level, pages, sections, breakpoints }`, `attributes`, `preserve`, `confidence`, `needsClarification`, `clarificationQuestion`) at `feedback/interpretation-<taskId>.json`.

## Tool requirements
- `magec_feedback_submit` — `text`, optional `interpretation` override, `persistence` (`project` default).
- `magec_artifact_read`, `magec_memory_search` — vocabulary and history.

## Instructions
1. Identify the intent: `refine`, `add`, `redesign`, `new-concept`, `reject-direction`, `remove`, `preserve`, `review`, `approve`, `general`.
2. Identify the scope level, narrowest first: `section` → `component` → `page` → `breakpoint` → `design-system` → `project`.
   - "The hero is too crowded" / "الهيرو مزدحم" → `refine`, section `hero`, attribute `more-whitespace`.
   - "I don't like the pricing section, try something else" / "لا يعجبني قسم الأسعار" → `redesign`, section `pricing`.
   - "I don't like this visual direction" / "لا يعجبني هذا الاتجاه" → `reject-direction`, project.
   - "Make the mobile version less busy" → `refine`, breakpoint `mobile`.
3. Capture preservation clauses ("keep the colors", "حافظ على الألوان") in `preserve`; they split at "but", "لكن", "،".
4. Map Arabic section words to ids (الهيرو/الواجهة → `hero`, الهيدر → `header`, الفوتر → `footer`, الأسعار → `pricing`, البحث → `search`, الفلاتر → `filters`, القائمة → `navigation`).
5. Submit with `magec_feedback_submit`. Pass `interpretation` only when the parser would get it wrong (unknown section names, mixed languages, sarcasm, a named section the vocabulary lacks).
6. Approval-like phrases ("perfect", "موافق") only resolve something if an approval is waiting; otherwise treat them as positive feedback.
7. Tell the user what will change and what will be preserved, in their language, before work starts.

## Constraints
- A redesign that names a section or page stays scoped; only unscoped rejection becomes a new project concept.
- `remove` without an identifiable page/section must not proceed: the runtime sets `needsClarification`; ask the question it returns. Removal always goes through an approval task.
- `persistence: "global"` only when the user explicitly asks to remember a preference across projects.
- Never edit Figma or decisions directly to "apply" feedback; work flows through the created tasks.

## Validation
- `scope.level` matches the narrowest unit the user named.
- Sections/pages in the scope exist in the vocabulary (or are generic ids such as `hero`, `footer`).
- Unrelated pages and sections have no new tasks.

## Error handling
- Low confidence (< 0.6) and the change is costly: ask a one-line clarification instead of guessing.
- Submit returns a clarification: relay it verbatim (translated if needed) and wait.
- Conflicting with an accepted decision: state the conflict and ask which wins.

## Related
- `approval-handling` — removals and concept choices.
- `user-feedback-processing`, `project-memory` — shared feedback and memory rules.
