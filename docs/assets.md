# Images & icons

The **asset agent** prepares every image and icon a page needs before the Figma Designer builds it. Each page
gets an `asset-sourcing` task, and the designer's page task depends on it.

## How the agent decides

| Need | Path |
|---|---|
| An image, and the host assistant has an image-generation tool | Generate it, then `magec_asset_register` with `origin: "generated"`, the tool and the exact prompt |
| An image, no generation tool | Free-license stock: `magec_image_search` (Unsplash/Pexels APIs, needs `UNSPLASH_ACCESS_KEY` or `PEXELS_API_KEY`) or the host's web search on unsplash.com / pexels.com / pixabay.com, then `magec_asset_download` |
| Icons | `magec_icon_get` from one open-source set: Lucide (ISC), Tabler (MIT) or Phosphor (MIT), pinned versions, sanitized SVG |
| Logo | Never generated or sourced: always the user's file in `assets/logos/` |

The runtime itself cannot generate images. `magec_asset_strategy` tells the agent this, so it only claims
generation when its host really has such a tool. A report that says `imageGeneration: "used"` without a
generated asset is rejected.

## Where things are saved

```
assets/images/       photos (generated, stock or the user's)
assets/icons/        icons (SVG)
assets/references/   reference images saved by research (inspiration only)
assets/assets.json   provenance: source page, author, license, or generation tool + prompt
```

Identical files are stored once. Reference previews are also kept in the cache as before; the copy in
`assets/references/` is the permanent one.

## Rules enforced by the runtime

- Images from design galleries (Behance, Dribbble, Pinterest, Awwwards, Land-book, ...) are refused as
  assets. They are other people's work and only inform the design.
- Downloads by URL are accepted only from unsplash.com, pexels.com and pixabay.com, or from candidates the
  stock API returned. Images are checked by their bytes (PNG, JPEG, GIF, WebP), not by file extension.
- SVGs are sanitized: no scripts, event handlers, foreign objects or external links.
- `magec_asset_register` only accepts files inside the project folder (not `.ui-ux-magec/`).
- An asset report may only list assets that exist in the library.

## Using assets in a design

In a `DesignSpec`:

```json
{ "id": "hero-photo", "name": "Hero / Photo", "width": "fill", "height": 420, "clip": true, "image": "assets/images/hero-team.jpg" }
{ "id": "icon", "name": "Icon / Arrow", "icon": "assets/icons/lucide-arrow-right.svg", "color": "$color.primary", "width": 24, "height": 24 }
```

`magec_figma_apply_spec` imports the image once (IMAGE fill) and turns the icon into an editable vector tinted
with the color token.

## Verification status

- Fetching icons from Lucide, Tabler and Phosphor was checked against the real internet.
- Unsplash and Pexels API calls are implemented from their documented formats, but were tested only against
  mocks (there are no API keys on this machine).
- Image generation depends on the host assistant's tools and has not been exercised.
