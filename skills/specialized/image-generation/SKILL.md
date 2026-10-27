---
name: image-generation
description: Generate project images with the host's own image-generation tool (when one exists) and register them in the asset library with the exact prompt.
category: specialized
agents: [asset-agent]
tools: [magec_asset_register, magec_asset_library]
related: [asset-planning, stock-image-sourcing, creative-direction]
---

# Image generation

## Purpose
When the host environment offers an image-generation tool, generated images can match the concept precisely.
The runtime itself cannot generate images; this skill uses the host tool and records the result honestly.

## When to use
- Only when your available tools include an image-generation tool. If not, use `stock-image-sourcing`.

## Inputs
- Slot descriptions from `asset-planning`; brand colors and personality.

## Outputs
- Image files inside the project, registered with `origin: "generated"`, the tool name and the exact prompt.

## Tool requirements
- The host's image-generation tool (name varies by host).
- `magec_asset_register` — `{ path, kind: "image", origin: "generated", purpose, name, generation: { tool, prompt } }`.

## Instructions
1. Write a precise prompt per slot: subject, composition, setting, lighting, palette (from brand tokens),
   style (photographic / 3D / illustration per concept), aspect ratio; add "no text, no logos, no watermark".
2. Generate, save the file somewhere inside the project folder (not in `.ui-ux-magec/`), and look at it.
3. Reject results with artifacts (hands, faces, garbled text) and regenerate with an adjusted prompt.
4. `magec_asset_register` the accepted file; the runtime copies it into `assets/images/`.

## Constraints
- Never imitate a living artist's style by name or reproduce trademarks.
- Never register a stock or web image as `generated`.

## Validation
- The library record has `origin: generated` and the prompt that produced the file.

## Error handling
- Tool unavailable or failing: switch to `stock-image-sourcing` and set `strategy.imageGeneration` accordingly.

## Related
- `asset-planning`, `stock-image-sourcing`.
