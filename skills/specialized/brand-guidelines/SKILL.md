---
name: brand-guidelines
description: Turn the brand analysis into concise, enforceable digital usage rules that downstream agents and QA can follow and check.
category: specialized
agents: [brand-identity-agent]
tools: [magec_artifact_read, magec_artifact_write, magec_memory_search, magec_decision_record, magec_contrast_check, magec_message_send, magec_checkpoint_create, magec_task_complete]
related: [brand-analysis, palette-generation, typography-selection, design-system-planning]
---

# Brand guidelines

## Purpose
A palette and fonts are not enough; designers need rules: where the logo goes, which color does what, how
Arabic and English coexist, what is forbidden. This skill writes those rules into `BrandAnalysis.rules` and an
optional readable `planning/brand-guidelines.md`, phrased so the creative director, design-system agent and QA
can apply them without interpretation.

## When to use
- As the last step of a `brand-analysis` task.
- When accepted decisions change brand rules (e.g. user accepted a proposed accent) and guidelines must follow.

## Inputs
- The draft `BrandAnalysis` (colors, typography, personality).
- Logo constraints from `logo-analysis`.
- Accepted/rejected decisions from `magec_memory_search` (`brand`).
- Project languages/direction and audience.

## Outputs
- `rules[]`: short, testable statements, for example:
  - "Primary #0E5A8A for primary actions and links; never for body text below 18px bold."
  - "Logo clear space = height of the mark's cap; minimum width 96px desktop, 72px mobile."
  - "Arabic UI uses IBM Plex Sans Arabic; no letter-spacing on Arabic text."
  - "Accent #F4A23B only for highlights and badges; never as text on white (2.1:1)."
  - "Photography: real people in context, warm daylight; no stock handshake imagery."
- Optional `planning/brand-guidelines.md` with sections: Logo, Color roles, Typography, Voice, Imagery, Do/Don't, Bilingual/RTL.

## Tool requirements
- `magec_artifact_write` — only for the readable guidelines in `planning/`; the contract output still goes through `magec_task_complete` in `brand-analysis`.
- `magec_contrast_check` — every color rule that mentions text cites a measured ratio.
- `magec_message_send` — hand off notable rules to `creative-director` or `design-system-agent`.

## Instructions
1. Write color rules per role: allowed uses, forbidden uses, and the ratio that justifies them.
2. Write logo rules from `logo-analysis`: versions, clear space, minimum size, allowed backgrounds, forbidden treatments.
3. Write typography rules: families per script, weight usage (e.g. 600 for headings, 400 body), Arabic line-height and no letter-spacing.
4. Write bilingual/RTL rules when relevant: mirrored layouts, logical alignment, numerals policy, icons that must not mirror (logos, media controls).
5. Write voice and imagery rules only from evidence in brief or assets; mark inferred ones as proposed.
6. Keep each rule one sentence, testable, and free of adjectives that cannot be checked.
7. If the readable guide is useful, write `planning/brand-guidelines.md` and mention its path in the task `notes`.
8. After the brand analysis is accepted, create a checkpoint with `magec_checkpoint_create` (stage `brand`).

## Constraints
- Rules may not contradict extracted identity or accepted decisions.
- Proposed rules are labeled as proposals until accepted.
- Do not prescribe layouts or components; that belongs to concepts and the design system.
- Guidelines live in `planning/`; never write into `design-system/` (owned by design-system-agent).

## Validation
- Each color rule has a role, scope and ratio; each typography rule names a family and usage.
- Arabic projects have explicit Arabic rules.
- No rule references a color or font absent from `BrandAnalysis`.

## Error handling
- Contradiction between a proposed rule and an accepted decision: drop the rule and note the conflict for the orchestrator.
- Insufficient evidence for voice/imagery rules: omit them and add a constraint "voice not defined by brand assets".

## Related
- `brand-analysis` — the contract these rules belong to.
- `design-system-planning` — consumes the rules when defining tokens and components.
