import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { defineTool } from '@ui-ux-magec/agent-core';
import { AssetLicenseSchema, z, type AssetRecord } from '@ui-ux-magec/schemas';
import { ICON_SETS, UnsplashProvider, freeImageHost, isInspirationHost, sanitizeSvg, type ImageCandidate, type IconSet } from '@ui-ux-magec/research';
import { AssetStore, sniffImage } from '../assets.js';
import type { MagecRuntime } from '../runtime.js';

const IconSetSchema = z.enum(Object.keys(ICON_SETS) as [IconSet, ...IconSet[]]);
const brief = (a: AssetRecord) => ({ assetId: a.assetId, kind: a.kind, path: a.path, purpose: a.purpose, origin: a.origin, license: a.license, author: a.author, sourcePage: a.sourcePage });

export function assetTools(rt: MagecRuntime) {
  const store = () => new AssetStore(rt.requireProject().ws);
  return [
    defineTool({
      name: 'magec_asset_strategy',
      description: 'How to obtain images and icons in this environment. Call first in an asset-sourcing task: it says which stock APIs are configured and how to use image generation if YOUR host has such a tool.',
      permissions: ['workspace.read'],
      input: z.object({}),
      handler: async () => ({
        imageGeneration: {
          runtime: false,
          instruction: 'The runtime cannot generate images. If your own tool list includes an image-generation tool, generate each needed image with it, save it inside the project folder, then call magec_asset_register with origin "generated" and the exact prompt. Otherwise do not invent one: source images instead.',
        },
        stockImages: rt.imageProviders.map((p) => ({ provider: p.id, available: p.available, ...(p.available ? {} : { enable: p.id === 'unsplash' ? 'set UNSPLASH_ACCESS_KEY' : 'set PEXELS_API_KEY' }) })),
        hostSearchFallback: 'With no stock API configured, use your web search on unsplash.com, pexels.com or pixabay.com and pass the image URL and its photo page to magec_asset_download. Images from design galleries (Behance, Dribbble, Pinterest, Awwwards...) are refused: they are references, not assets.',
        iconSets: Object.entries(ICON_SETS).map(([id, s]) => ({ id, name: s.name, version: s.version, license: s.license, browse: s.homepage })),
      }),
    }),
    defineTool({
      name: 'magec_image_search',
      description: 'Search free-license stock photos (Unsplash, Pexels) through their official APIs. Returns candidates with author and license; download the chosen ones with magec_asset_download.',
      permissions: ['research.network'],
      input: z.object({ query: z.string().min(2), count: z.number().int().min(1).max(20).default(8), orientation: z.enum(['landscape', 'portrait', 'square']).optional() }),
      handler: async (i) => {
        const { cache } = rt.requireProject();
        const available = rt.imageProviders.filter((p) => p.available);
        if (!available.length) return { candidates: [], note: 'no stock image API configured (UNSPLASH_ACCESS_KEY or PEXELS_API_KEY); use your host web search on unsplash.com / pexels.com / pixabay.com instead' };
        const candidates: Array<ImageCandidate & { candidateId: string }> = [];
        const errors: string[] = [];
        for (const p of available) {
          try {
            for (const c of await p.search(i.query, { count: i.count, ...(i.orientation ? { orientation: i.orientation } : {}) })) {
              const candidateId = `${c.provider}:${c.id}`;
              await cache.set('research-results', `image:${candidateId}`, c, { source: c.sourcePage });
              candidates.push({ ...c, candidateId });
            }
          } catch (err) {
            errors.push(`${p.id}: ${(err as Error).message}`);
          }
        }
        return { candidates: candidates.map(({ candidateId, description, previewUrl, author, license, width, height, sourcePage }) => ({ candidateId, description, previewUrl, author, license, width, height, sourcePage })), errors };
      },
    }),
    defineTool({
      name: 'magec_asset_download',
      description: 'Download a permitted image into assets/images and record its provenance. Pass a candidateId from magec_image_search, or the url + photo page of an image on unsplash.com / pexels.com / pixabay.com. Images from design galleries are refused.',
      permissions: ['assets.write', 'research.network'],
      input: z.object({
        candidateId: z.string().optional(),
        url: z.string().url().optional(),
        sourcePage: z.string().url().optional(),
        author: z.string().optional(),
        purpose: z.string().min(3),
        name: z.string().min(1),
        taskId: z.string().optional(),
      }),
      handler: async (i, ctx) => {
        const { cache, fetcher } = rt.requireProject();
        let c: ImageCandidate | null = null;
        if (i.candidateId) {
          c = (await cache.get<ImageCandidate>('research-results', `image:${i.candidateId}`))?.value ?? null;
          if (!c) throw new Error(`unknown candidate ${i.candidateId}; search again with magec_image_search`);
        } else {
          if (!i.url || !i.sourcePage) throw new Error('provide candidateId, or url + sourcePage');
          if (isInspirationHost(i.url) || isInspirationHost(i.sourcePage)) throw new Error('refused: images from design galleries are other people\'s work; use them only as references');
          const lic = freeImageHost(i.sourcePage) ?? freeImageHost(i.url);
          if (!lic || !freeImageHost(i.url)) throw new Error('refused: only images hosted by unsplash.com, pexels.com or pixabay.com (or found with magec_image_search) can be downloaded; generate or ask the user for anything else');
          c = { provider: lic.provider, id: i.url, description: i.purpose, downloadUrl: i.url, previewUrl: i.url, sourcePage: i.sourcePage, author: i.author ?? 'unknown', license: lic.license, licenseUrl: '', width: 0, height: 0 };
        }
        const img = await fetcher.fetchImage(c.downloadUrl);
        if (!img.ok) throw new Error(`download failed: ${img.reason}`);
        const kind = sniffImage(img.bytes);
        if (!kind) throw new Error('downloaded file is not a PNG, JPEG, GIF or WebP image');
        const { record, duplicate } = await store().add(img.bytes, 'images', i.name, kind.ext, {
          kind: 'image', purpose: i.purpose, origin: 'stock', license: c.license, ...(c.licenseUrl ? { licenseUrl: c.licenseUrl } : {}), author: c.author,
          ...(c.authorUrl ? { authorUrl: c.authorUrl } : {}), sourcePage: c.sourcePage, provider: c.provider, mimeType: kind.mimeType,
          ...(c.width ? { width: c.width, height: c.height } : {}), addedBy: ctx.agentId, ...(i.taskId ? { taskId: i.taskId } : {}),
        });
        const unsplash = rt.imageProviders.find((p) => p.id === 'unsplash');
        if (!duplicate && unsplash instanceof UnsplashProvider) await unsplash.trackDownload(c);
        return { asset: brief(record), duplicate };
      },
    }),
    defineTool({
      name: 'magec_icon_get',
      description: 'Fetch icons from an open-source set (Lucide, Tabler, Phosphor) as sanitized SVG into assets/icons. Use the set\'s own icon names (e.g. lucide "arrow-right").',
      permissions: ['assets.write', 'research.network'],
      input: z.object({ set: IconSetSchema.default('lucide'), names: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).max(30), purpose: z.string().default('interface icon'), taskId: z.string().optional() }),
      handler: async (i, ctx) => {
        const { fetcher } = rt.requireProject();
        const set = ICON_SETS[i.set];
        const icons: ReturnType<typeof brief>[] = [];
        const missing: Array<{ name: string; reason: string }> = [];
        for (const name of i.names) {
          const r = await fetcher.fetchText(set.url(name), 'image/svg+xml,*/*;q=0.5');
          if (!r.ok) {
            missing.push({ name, reason: r.reason === 'http 404' ? `no icon named "${name}" in ${set.name} ${set.version}` : r.reason });
            continue;
          }
          let svg: string;
          try {
            svg = sanitizeSvg(r.text);
          } catch (err) {
            missing.push({ name, reason: (err as Error).message });
            continue;
          }
          const { record } = await store().add(new TextEncoder().encode(svg), 'icons', `${i.set}-${name}`, '.svg', {
            kind: 'icon', purpose: i.purpose, origin: 'icon-set', license: set.license, sourcePage: set.homepage, provider: `${i.set}@${set.version}`,
            mimeType: 'image/svg+xml', addedBy: ctx.agentId, ...(i.taskId ? { taskId: i.taskId } : {}),
          });
          icons.push(brief(record));
        }
        return { icons, missing };
      },
    }),
    defineTool({
      name: 'magec_asset_register',
      description: 'Add a file that is already inside the project folder to the asset library: an image you generated with your host\'s image tool (origin "generated", with the prompt), or a file the user supplied (origin "user"). It is copied into assets/images or assets/icons.',
      permissions: ['assets.write'],
      input: z.object({
        path: z.string(),
        kind: z.enum(['image', 'icon']),
        origin: z.enum(['generated', 'user']),
        purpose: z.string().min(3),
        name: z.string().min(1),
        generation: z.object({ tool: z.string(), prompt: z.string().min(3) }).optional(),
        license: AssetLicenseSchema.optional(),
        taskId: z.string().optional(),
      }),
      handler: async (i, ctx) => {
        if (i.origin === 'generated' && !i.generation) throw new Error('generated assets must record the generation tool and prompt');
        const s = store();
        const bytes = new Uint8Array(await readFile(s.resolveInsideProject(i.path)));
        let ext: string;
        let mimeType: string;
        let data = bytes;
        if (i.kind === 'icon' || extname(i.path).toLowerCase() === '.svg') {
          data = new TextEncoder().encode(sanitizeSvg(new TextDecoder().decode(bytes)));
          [ext, mimeType] = ['.svg', 'image/svg+xml'];
        } else {
          const k = sniffImage(bytes);
          if (!k) throw new Error('not a PNG, JPEG, GIF or WebP image');
          [ext, mimeType] = [k.ext, k.mimeType];
        }
        const { record, duplicate } = await s.add(data, i.kind === 'icon' ? 'icons' : 'images', i.name, ext, {
          kind: i.kind, purpose: i.purpose, origin: i.origin, license: i.license ?? (i.origin === 'generated' ? 'generated' : 'user-owned'),
          ...(i.generation ? { generation: i.generation } : {}), mimeType, addedBy: ctx.agentId, ...(i.taskId ? { taskId: i.taskId } : {}),
        });
        return { asset: brief(record), duplicate };
      },
    }),
    defineTool({
      name: 'magec_asset_library',
      description: 'List the project asset library (images, icons, saved reference images) with paths and provenance.',
      permissions: ['workspace.read'],
      input: z.object({ kind: z.enum(['image', 'icon', 'reference']).optional() }),
      handler: async (i) => ({ assets: (await store().list(i.kind ? { kind: i.kind } : {})).map(brief) }),
    }),
  ];
}
