---
name: stock-image-sourcing
description: Find and download free-license stock photos (Unsplash, Pexels, Pixabay) that fit the concept, recording author, source page and license.
category: specialized
agents: [asset-agent]
tools: [magec_asset_strategy, magec_image_search, magec_asset_download, magec_asset_library, magec_asset_list]
related: [asset-planning, image-generation, source-validation]
---

# Stock image sourcing

## Purpose
Real photos with a clear license, chosen for the concept, saved in `assets/images/` with full provenance.

## When to use
- Image slots decided as `stock` (no image-generation tool, or a real photo is better).

## Inputs
- Slot descriptions (subject, mood, orientation) from `asset-planning`.

## Outputs
- Downloaded images in the asset library with author, source page and license.

## Tool requirements
- `magec_image_search` — official Unsplash/Pexels APIs when `UNSPLASH_ACCESS_KEY` / `PEXELS_API_KEY` are set.
- Host web search — otherwise, restricted to `unsplash.com`, `pexels.com`, `pixabay.com` photo pages.
- `magec_asset_download` — `{ candidateId }` or `{ url, sourcePage, author }`; refuses gallery/inspiration hosts.

## Instructions
1. Query with concrete, short keywords (2–4 words) per slot; try 2–3 variations before settling.
2. Inspect previews; pick by composition, light and palette fit, space for overlaid text, and market fit.
3. With host search: open the photo page, take the direct image URL from that site's own CDN
   (images.unsplash.com, images.pexels.com, cdn.pixabay.com) and the photographer's name.
4. Download with a meaningful `name` (`hero-team-workshop`) and `purpose` (the slot).
5. Read the downloaded file to confirm it is the intended photo.

## Constraints
- Never download from Behance, Dribbble, Pinterest, Awwwards or any other design gallery, or from sites
  without a free license; the tool refuses them anyway.
- Avoid photos with visible trademarks or watermarks.

## Validation
- Each record has `license`, `author` and `sourcePage`.

## Error handling
- No suitable photo after a few queries: list the slot in `unresolved` with what was tried.

## Related
- `asset-planning`, `image-generation`, `source-validation`.
