---
name: asset-planning
description: Derive the image and icon slots a page needs from the concept, sitemap and content, and decide for each image whether to generate or source it.
category: specialized
agents: [asset-agent]
tools: [magec_project_context, magec_artifact_read, magec_asset_strategy, magec_asset_library]
related: [image-generation, stock-image-sourcing, icon-sourcing, creative-direction]
---

# Asset planning

## Purpose
Know exactly which images and icons a page needs before fetching anything, so assets match the concept and
nothing is downloaded "just in case".

## When to use
- At the start of every `asset-sourcing` task.

## Inputs
- Accepted concept (imagery and iconography direction), page sections from `planning/product-analysis.json`,
  brand analysis, existing asset library.

## Outputs
- A slot list: `slot` (`<section>/<role>`), kind (`image` | `icon`), description, orientation/size, and
  decision (`generate` | `stock` | `icon-set` | `reuse:<assetId>`).

## Tool requirements
- `magec_asset_strategy` — whether stock APIs are configured; the runtime never generates images itself.
- `magec_asset_library` — what already exists.

## Instructions
1. Walk the page's sections in order; for each, list the imagery it really needs (hero visual, feature
   illustrations, team photos, testimonial avatars, product shots) and the icons (feature icons, nav, social,
   form fields).
2. Describe each image concretely from the concept: subject, setting, mood, light, color temperature, framing,
   orientation, and market fit (e.g. Gulf/Egyptian context for Arabic projects).
3. Decide per image: `generate` only if your own tool list contains an image-generation tool; otherwise
   `stock`. Logos are never generated or sourced — they come from `assets/logos`.
4. Reuse library assets that fit the same purpose and style rather than adding near-duplicates.
5. Icons: one set for the whole project (`lucide` by default; keep whatever set the library already uses).

## Constraints
- No images of text, UI screenshots, or other companies' work.
- Keep the count proportional: a landing page rarely needs more than 4–8 photos.

## Validation
- Every section with a visual element has a slot; every slot has a decision.

## Error handling
- Concept missing imagery direction: derive it from brand personality and record an assumption.

## Related
- `image-generation`, `stock-image-sourcing`, `icon-sourcing`.
