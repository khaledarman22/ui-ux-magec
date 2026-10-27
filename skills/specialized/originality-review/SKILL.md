---
name: originality-review
description: Check every concept for copying, convergence, rejected-direction repeats, unsupported claims and usability risks before the ConceptSet is submitted.
category: specialized
agents: [creative-director]
tools: [magec_artifact_read, magec_reference_list, magec_memory_search, magec_project_context, magec_reference_reject, magec_contrast_check, magec_message_send]
related: [concept-generation, reference-synthesis, creative-direction, quality-standards]
---

# Originality review

## Purpose
The last gate before concepts reach the user. It catches the failures users notice immediately: a concept that is
a known site with new colors, three concepts that are the same idea, the direction they already rejected coming
back, and references cited that never informed anything. It also fills `originalityNotes` honestly.

## When to use
- On every concept, after `concept-generation` and before `magec_task_complete`.
- When a user says a concept "looks like" a specific site.

## Inputs
- Draft concepts, cited references and their saved analyses.
- Rejected directions (`magec_memory_search` kinds `decision`, `feedback`; tag `rejected-direction`) and task `avoid`.

## Outputs
- Revised or dropped concepts.
- `originalityNotes` per concept: what principles it borrows (with reference ids) and what is original.
- Additions to `avoided` and `rejectedReferenceIds`.

## Tool requirements
- `magec_artifact_read`, `magec_reference_list` — compare concepts with cited analyses.
- `magec_memory_search` — rejected directions.
- `magec_contrast_check` — spot-check accessibility claims.

## Instructions
Check each concept against this list; any "yes" means revise:
1. Copying: does the layout, section order, composition, illustration style, copy or branding match one reference closely enough to be recognised? Borrow principles, not arrangements.
2. Single-source dependence: does the concept rest on one reference? Combine principles from several or reframe.
3. Convergence: would a non-designer describe two concepts the same way? They must differ on at least three axes (layout model, type voice, color strategy, imagery, interaction density).
4. Rejected direction: does it repeat any rejected direction, partially or with different colors?
5. Unsupported citation: is any `referenceIds` entry unverified, rejected, or unrelated to what the concept uses?
6. Usability: does a visual idea compromise readability, navigation, RTL or touch targets without a stated safeguard?
7. Feasibility: can it be built with tokens and auto layout, with available fonts and assets?
Then write `originalityNotes`: "Borrows persistent filter chips (ref_a1, ref_c4) and price-first hierarchy (ref_f2); original: courtyard-inspired asymmetric grid and arch-shaped image masks drawn from the brand's architecture."

## Constraints
- Be specific: name the element and the reference it resembles.
- Do not pass a concept you could not compare because the analysis is missing; mark the gap in `originalityNotes`.
- Do not soften known risks; they belong in `disadvantages`.

## Validation
- Every concept has non-empty `originalityNotes` that distinguish borrowed principles from original elements.
- No concept matches a rejected direction; `avoided` lists what was excluded.
- All cited references are verified and not rejected.

## Error handling
- A concept fails on copying and cannot be fixed: drop it and generate a replacement from an unused approach.
- User claims resemblance after delivery: treat it as feedback; compare, acknowledge specifics, and route a revision through the orchestrator.

## Related
- `concept-generation` — produces what this reviews.
- `reference-synthesis` — the principles concepts may borrow.
- `quality-standards` — shared definition of done.
