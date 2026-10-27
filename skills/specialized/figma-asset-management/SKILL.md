---
name: figma-asset-management
description: Place real, permitted project assets (logos, photos, icons) into Figma as image fills or SVG nodes, and mark anything unsourced as placeholder.
category: specialized
agents: [figma-designer]
tools: [magec_asset_list, magec_asset_library, magec_figma_import_image, magec_figma_apply_spec, magec_design_spec_validate, magec_artifact_read, magec_figma_export_preview, magec_message_send]
related: [figma-frame-creation, logo-analysis, brand-guidelines, figma-layer-organization]
---

# Figma asset management

## Purpose
Designs need real logos, photos and icons. Only files in the project `assets/` folder are imported: the user's
own files, and images/icons the asset-agent generated or sourced with a recorded license (`assets/assets.json`). Raster images become `IMAGE` fills on frames; vector logos and icons become `SVG` nodes so they
stay crisp and editable. Missing imagery is marked `placeholder: true` so QA blocks it from shipping as final.

## When to use
- Placing the logo in headers/footers, hero imagery, product photos, icon sets.
- When QA reports `placeholder-content`.

## Inputs
- `reports/assets-<page>.json`: the slots the asset-agent filled for this page.
- `magec_asset_library` (provenance) and `magec_asset_list` (absolute paths, to look at files).
- Brand rules (logo versions, clear space, minimum size) from `planning/brand-analysis.json`.

## Outputs
- `imageHash` values used in specs; SVG markup embedded in `SVG` nodes.
- Report entries for the frames that hold assets.

## Tool requirements
- `magec_figma_import_image` — `{ taskId, assetPath: "assets/..." }`; PNG, JPEG, GIF only; returns `imageHash` (cached per file).
- Host `Read` — open the image to confirm it is the right asset, and read SVG markup.

## Instructions
1. List assets and look at each candidate before using it; choose by content, not filename.
2. Raster image: reference it from the library and let `magec_figma_apply_spec` import it:
   ```json
   { "id": "hero-photo", "name": "Hero / Photo", "width": "fill", "height": 420, "radius": "$radius.md", "clip": true,
     "image": "assets/images/team-workshop.jpg", "imageScale": "FILL" }
   ```
   (`fills` with an `imageHash` from `magec_figma_import_image` still works for one-off patches.)
3. Icon: `{ "id": "search-icon", "name": "Icon / Search", "icon": "assets/icons/lucide-search.svg", "color": "$color.text", "width": 24, "height": 24 }`
   becomes an editable vector tinted with the token. A vector logo: read the file and embed it as an `SVG` node.
4. Respect logo rules: correct version for the background, minimum width, clear space via padding; never recolor or distort (keep aspect ratio).
5. Icons: use one consistent set; name nodes by meaning (`Icon / Search`). Directional icons mirror in RTL; logos do not.
6. No suitable asset: use a token-filled frame with `placeholder: true` and a descriptive name (`Hero / Photo (placeholder: family at home)`), and list it in `warnings`.
7. Export a preview and check images are not stretched, cropped badly or low-resolution.

## Constraints
- Only files under `assets/` that are user-owned or recorded in the asset library; never place reference images (`assets/references/`) or anything downloaded outside the asset tools.
- Never present a placeholder as final; never use a screenshot of UI as an image fill.
- Text never lives inside images; use TEXT layers.

## Validation
- Every image/icon in the spec is in the asset library or `assets/logos/`.
- Placeholders are flagged and listed; the logo matches the brand analysis version.

## Error handling
- Unsupported format (WEBP, PDF, AI): ask via `magec_message_send` for a PNG/SVG export; use a placeholder meanwhile.
- Import fails (`not_connected`, size limits): report in `warnings`/`unsupported`; do not substitute an unrelated image.

## Related
- `logo-analysis`, `brand-guidelines` — logo usage rules.
- `figma-frame-creation` — where assets are placed.
