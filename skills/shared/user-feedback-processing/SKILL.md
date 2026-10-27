---
name: user-feedback-processing
description: Turn English or Arabic user feedback into correctly scoped intents and tasks, preserving what the user wants kept and never repeating rejected directions.
category: shared
agents: []
tools: [magec_feedback_submit, magec_memory_search, magec_project_context, magec_approval_resolve]
related: [project-memory, retry-management, task-communication]
---

# User feedback processing

## Purpose
Users react in natural language, in English or Arabic, often mixing praise, complaints and constraints in one
sentence. This skill makes sure feedback becomes the smallest correct unit of work, that unrelated pages and
sections are left untouched, and that what the user rejected stays rejected.

## When to use
- The user comments on a concept, page, section, breakpoint or the design system.
- You run a `feedback-interpretation` task (master-orchestrator).
- You generate concepts or designs after earlier feedback (creative-director, figma-designer).

## Inputs
- The user's exact words (any language; Arabic text is right-to-left and must be quoted verbatim).
- Vocabulary from `planning/product-analysis.json`: page slugs and section ids.
- Recent feedback, decisions and rejected directions from `magec_project_context`.

## Outputs
- A `FeedbackInterpretation`: `intent`, `scope` (`level`: project/page/section/component/breakpoint/
  design-system, `pages`, `sections`, `breakpoints`), `attributes`, `preserve`, `confidence`,
  `needsClarification`, optional `clarificationQuestion`.
- Scoped tasks created by `magec_feedback_submit`.

## Tool requirements
- `magec_feedback_submit` — orchestrator only; parses (or accepts your `interpretation`) and creates tasks.
- `magec_memory_search` — earlier feedback and rejected directions on the same scope.
- `magec_approval_resolve` — orchestrator only; for explicit answers to waiting approvals.

## Instructions
1. Identify the intent:
   - `refine` / `add` — adjust the existing design ("more whitespace in the hero", "أضف قسم الأسعار").
   - `redesign` — the user dislikes a specific section or page; it gets new research, a new concept and a
     redesign for that scope only.
   - `new-concept` / `reject-direction` — the overall direction is rejected; a new direction is planned and
     the old concept decision becomes `rejected`. New pages get a suffix (e.g. "Concept 2") so nothing existing
     is overwritten.
   - `remove` — needs an approval before anything is deleted; unscoped removal needs clarification.
   - `preserve` — "keep the header" becomes an accepted decision that later work must respect.
   - `review`, `approve`, `general` (unclear; becomes a `feedback-interpretation` task).
2. Scope as narrowly as the words allow. "The hero is boring" is a section, not the project. Never expand
   scope to unrelated pages or sections.
3. Split mixed feedback: "I love the colors but the cards are cramped" → preserve colors, refine cards.
4. Extract attributes (premium, minimal, bolder, more-whitespace, typography, color, imagery, accessibility...)
   and pass them through.
5. Arabic and RTL: understand Arabic feedback directly; treat RTL issues (mirrored layout, alignment,
   numerals, Arabic font) as concrete refine items for the `rtl` direction and breakpoints mentioned.
6. Override the rule-based parser only when you are confident it misread the text; pass your
   `interpretation` to `magec_feedback_submit`.
7. If a destructive request is ambiguous, ask the user the clarification question before submitting.
8. Treat "approve"/"موافق" as approval only when it clearly answers a pending approval; resolve with the
   user's quoted words.

## Constraints
- Creative rejection is not failure: never call `magec_task_fail` because the user disliked a design.
- Never repeat a rejected direction, including close variations, in the same scope.
- Never delete or overwrite as a result of feedback without an approved approval task.
- Feedback persists to the project only; use `persistence: global` only when the user explicitly asks for a
  reusable preference.

## Validation
- Intent and scope match the user's words; untouched areas are listed in `preserve` when mentioned.
- Created tasks are limited to the affected pages/sections.
- The rejected direction appears in memory with status `rejected`.

## Error handling
- `needsClarification` returned: relay the clarification question to the user; create nothing else.
- Low confidence (< 0.6) on a non-trivial change: confirm your reading with the user first.
- Feedback references a page or section that does not exist: ask, do not guess.

## Related
- `project-memory` — decision statuses and rejected directions.
- `retry-management` — redesign vs retry vs reset vs delete.
- `task-communication` — asking the user through approvals.
