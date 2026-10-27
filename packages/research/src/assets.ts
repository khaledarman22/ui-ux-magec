import type { AssetLicense } from '@ui-ux-magec/schemas';
import type { FetchLike } from './fetcher.js';
import { SOURCES } from './sources.js';

/* ---------- Icons ---------- */

/** Open-source icon sets, pinned to exact versions and served by unpkg. */
export const ICON_SETS = {
  lucide: { name: 'Lucide', version: '0.460.0', license: 'isc' as AssetLicense, homepage: 'https://lucide.dev', url: (icon: string) => `https://unpkg.com/lucide-static@0.460.0/icons/${icon}.svg` },
  tabler: { name: 'Tabler Icons', version: '3.19.0', license: 'mit' as AssetLicense, homepage: 'https://tabler.io/icons', url: (icon: string) => `https://unpkg.com/@tabler/icons@3.19.0/icons/outline/${icon}.svg` },
  phosphor: { name: 'Phosphor', version: '2.1.1', license: 'mit' as AssetLicense, homepage: 'https://phosphoricons.com', url: (icon: string) => `https://unpkg.com/@phosphor-icons/core@2.1.1/assets/regular/${icon}.svg` },
} as const;
export type IconSet = keyof typeof ICON_SETS;

export class UnsafeSvgError extends Error {}

/**
 * Makes third-party SVG safe to store and hand to Figma: no scripts, event handlers, foreign content or
 * external references. Throws when the input is not an SVG document.
 */
export function sanitizeSvg(svg: string): string {
  let out = svg.replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!/^<svg[\s>]/i.test(out) || !/<\/svg>\s*$/i.test(out)) throw new UnsafeSvgError('not an SVG document');
  out = out
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/\sclass\s*=\s*("[^"]*"|'[^']*')/gi, '');
  if (/<script|javascript:/i.test(out)) throw new UnsafeSvgError('SVG still contains active content');
  return out;
}

/** Replaces `currentColor` (used by icon sets) with a concrete color so Figma renders the intended tint. */
export function tintSvg(svg: string, hex: string): string {
  return svg.replace(/currentColor/g, hex);
}

/* ---------- Images ---------- */

/** Hosts of free-to-use image libraries, with the license their content is published under. */
export const FREE_IMAGE_HOSTS: Record<string, { provider: string; license: AssetLicense }> = {
  'unsplash.com': { provider: 'unsplash', license: 'unsplash' },
  'images.unsplash.com': { provider: 'unsplash', license: 'unsplash' },
  'pexels.com': { provider: 'pexels', license: 'pexels' },
  'images.pexels.com': { provider: 'pexels', license: 'pexels' },
  'pixabay.com': { provider: 'pixabay', license: 'pixabay' },
  'cdn.pixabay.com': { provider: 'pixabay', license: 'pixabay' },
};

const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');

export function freeImageHost(url: string): { provider: string; license: AssetLicense } | null {
  try {
    return FREE_IMAGE_HOSTS[host(url)] ?? null;
  } catch {
    return null;
  }
}

/** True for design-inspiration sites (Behance, Dribbble, ...): their images are references, never assets. */
export function isInspirationHost(url: string): boolean {
  try {
    const h = host(url);
    // Gallery domains plus the CDNs that serve their images.
    const inspiration = [...SOURCES.flatMap((s) => s.domains), 'pinimg.com'];
    return inspiration.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export interface ImageCandidate {
  provider: string;
  id: string;
  description: string;
  /** Full-resolution file to download. */
  downloadUrl: string;
  previewUrl: string;
  sourcePage: string;
  author: string;
  authorUrl?: string;
  license: AssetLicense;
  licenseUrl: string;
  width: number;
  height: number;
  /** Provider endpoint that must be called when the image is used (Unsplash API guidelines). */
  trackDownloadUrl?: string;
}

export interface ImageSearchProvider {
  readonly id: string;
  readonly available: boolean;
  search(query: string, opts?: { count?: number; orientation?: 'landscape' | 'portrait' | 'square' }): Promise<ImageCandidate[]>;
}

export class UnsplashProvider implements ImageSearchProvider {
  readonly id = 'unsplash';
  constructor(private readonly key: string | undefined = process.env.UNSPLASH_ACCESS_KEY, private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i)) {}
  get available(): boolean {
    return Boolean(this.key);
  }
  async search(query: string, opts: { count?: number; orientation?: 'landscape' | 'portrait' | 'square' } = {}): Promise<ImageCandidate[]> {
    if (!this.key) throw new Error('Unsplash is not configured (UNSPLASH_ACCESS_KEY)');
    const orientation = opts.orientation === 'square' ? 'squarish' : opts.orientation;
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${Math.min(opts.count ?? 10, 30)}&content_filter=high${orientation ? `&orientation=${orientation}` : ''}`;
    const res = await this.fetchImpl(url, { headers: { authorization: `Client-ID ${this.key}`, 'accept-version': 'v1' } });
    if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);
    const body = (await res.json()) as { results?: Array<{ id: string; description?: string | null; alt_description?: string | null; width: number; height: number; urls: { regular: string; small: string }; links: { html: string; download_location: string }; user: { name: string; links: { html: string } } }> };
    return (body.results ?? []).map((r) => ({
      provider: this.id, id: r.id, description: r.alt_description ?? r.description ?? '', downloadUrl: r.urls.regular, previewUrl: r.urls.small,
      sourcePage: r.links.html, author: r.user.name, authorUrl: r.user.links.html, license: 'unsplash', licenseUrl: 'https://unsplash.com/license',
      width: r.width, height: r.height, trackDownloadUrl: r.links.download_location,
    }));
  }
  /** Unsplash requires a call to the download endpoint whenever a photo is used. */
  async trackDownload(c: ImageCandidate): Promise<void> {
    if (this.key && c.trackDownloadUrl) await this.fetchImpl(c.trackDownloadUrl, { headers: { authorization: `Client-ID ${this.key}` } }).catch(() => undefined);
  }
}

export class PexelsProvider implements ImageSearchProvider {
  readonly id = 'pexels';
  constructor(private readonly key: string | undefined = process.env.PEXELS_API_KEY, private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i)) {}
  get available(): boolean {
    return Boolean(this.key);
  }
  async search(query: string, opts: { count?: number; orientation?: 'landscape' | 'portrait' | 'square' } = {}): Promise<ImageCandidate[]> {
    if (!this.key) throw new Error('Pexels is not configured (PEXELS_API_KEY)');
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${Math.min(opts.count ?? 10, 40)}${opts.orientation ? `&orientation=${opts.orientation}` : ''}`;
    const res = await this.fetchImpl(url, { headers: { authorization: this.key } });
    if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
    const body = (await res.json()) as { photos?: Array<{ id: number; alt?: string; width: number; height: number; url: string; photographer: string; photographer_url: string; src: { large2x: string; medium: string } }> };
    return (body.photos ?? []).map((r) => ({
      provider: this.id, id: String(r.id), description: r.alt ?? '', downloadUrl: r.src.large2x, previewUrl: r.src.medium, sourcePage: r.url,
      author: r.photographer, authorUrl: r.photographer_url, license: 'pexels', licenseUrl: 'https://www.pexels.com/license/', width: r.width, height: r.height,
    }));
  }
}
