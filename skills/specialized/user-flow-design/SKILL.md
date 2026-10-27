---
name: user-flow-design
description: Describe the key journeys each role takes through the sitemap, step by step, including failure and empty paths, so designers build connected screens.
category: specialized
agents: [product-analyst]
tools: [magec_project_context, magec_artifact_read, magec_assumption_record, magec_artifact_write]
related: [information-architecture, feature-planning, requirements-analysis]
---

# User flow design

## Purpose
Pages designed in isolation often miss the transitions between them: where a filter result leads, what happens
after a failed payment, how an agent returns to a draft. `userFlows` in `ProductAnalysis` give designers and QA the
journeys that must work end to end.

## When to use
- Inside `product-analysis`, after the sitemap exists.
- When an audit or feedback reveals a broken or missing journey.

## Inputs
- Roles and audience needs (`product-discovery`).
- Sitemap pages and sections (`information-architecture`), features and states (`feature-planning`).

## Outputs
`userFlows[]` with `id` (kebab-case), `name`, `actor` (one of `roles` or an audience), `steps[]` (at least 2).

Example:
```json
{ "id": "find-and-contact-agent", "name": "Find a property and contact the agent", "actor": "buyer",
  "steps": ["home: enter area in search", "listings: apply price and bedroom filters", "listings: no results -> broaden filters suggestion",
            "property-detail: view gallery and monthly cost", "property-detail: submit contact form", "property-detail: success confirmation"] }
```

## Tool requirements
- `magec_artifact_read` — sitemap and features while drafting.
- `magec_assumption_record` — for steps inferred from domain conventions (e.g. OTP login).

## Instructions
1. Write one flow per primary goal of each role, then the critical secondary flows (sign-up, recovery, checkout, publish listing).
2. Prefix each step with the page slug (`listings: ...`) so steps map to designed screens.
3. Include the non-happy branches that need UI: empty results, validation errors, failed payment, expired session.
4. Keep steps at the level of user intent and screen change, not individual clicks.
5. Check every step's page exists in the sitemap; if not, add the page or explain the off-product step ("email: open verification link").
6. Note RTL-relevant steps (form direction, phone number formats) when `direction` is `rtl` or `both`.

## Constraints
- Every flow has at least two steps and a named actor.
- Do not invent capabilities not present in features; if a flow needs one, go back to `requirements-analysis`.
- Do not describe visual design; flows are behaviour.

## Validation
- Each `must` feature is exercised by at least one flow.
- Every page slug used in steps exists in the sitemap.
- Error and empty branches correspond to `states` declared on the relevant features.

## Error handling
- A flow reveals a missing feature: add it with a justification and priority, or record it as an open question.
- Too many flows: keep the ones covering `must` features and list others in `notes`.

## Related
- `information-architecture` — pages the flows move through.
- `feature-planning` — states the branches require.
