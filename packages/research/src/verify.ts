import type { CacheService } from '@ui-ux-magec/cache';
import type { ReferenceCandidate } from '@ui-ux-magec/schemas';
import type { ResearchFetcher } from './fetcher.js';
import { sourceForUrl } from './sources.js';

export interface VerificationOutcome {
  url: string;
  source: string;
  verified: boolean;
  status?: number;
  finalUrl?: string;
  title?: string;
  description?: string;
  previewUrl?: string;
  failure?: string;
  retrievedAt?: string;
  sourceItemId?: string;
}

/**
 * Turns candidate URLs (from a search provider or the host assistant) into verified facts by fetching them.
 * Login-only sources are never fetched with credentials; they come back unverified with the reason.
 */
export class ReferenceVerifier {
  constructor(private readonly fetcher: ResearchFetcher) {}

  async verify(candidate: Pick<ReferenceCandidate, 'url'> & Partial<ReferenceCandidate>): Promise<VerificationOutcome> {
    const src = sourceForUrl(candidate.url);
    let itemId: string | undefined;
    try {
      itemId = src.itemId?.(new URL(candidate.url));
    } catch {
      itemId = undefined;
    }
    const base = { url: candidate.url, source: src.id, ...(itemId ? { sourceItemId: itemId } : {}) };
    if (src.access === 'login-required') return { ...base, verified: false, failure: `${src.name} requires login; not retrieved` };
    const page = await this.fetcher.fetchPage(candidate.url);
    if (!page.ok) return { ...base, verified: false, ...(page.status ? { status: page.status } : {}), failure: page.failure ?? 'unknown', ...(page.finalUrl ? { finalUrl: page.finalUrl } : {}) };
    return {
      ...base,
      verified: true,
      ...(page.status ? { status: page.status } : {}),
      ...(page.finalUrl ? { finalUrl: page.finalUrl } : {}),
      title: page.metadata?.title ?? '',
      description: page.metadata?.description ?? '',
      ...(page.metadata?.image ? { previewUrl: page.metadata.image } : {}),
      ...(page.retrievedAt ? { retrievedAt: page.retrievedAt } : {}),
    };
  }

  /** Downloads a preview image into the reference-previews cache and returns its local path. */
  async downloadPreview(previewUrl: string, cache: CacheService, referenceId: string): Promise<{ ok: true; path: string; hash: string; mimeType: string } | { ok: false; reason: string }> {
    const img = await this.fetcher.fetchImage(previewUrl);
    if (!img.ok) return img;
    const ext = img.mimeType === 'image/png' ? '.png' : img.mimeType === 'image/gif' ? '.gif' : img.mimeType === 'image/webp' ? '.webp' : '.jpg';
    const entry = await cache.set('reference-previews', referenceId, img.bytes, { source: previewUrl, ext, dependencies: [`reference:${referenceId}`] });
    return { ok: true, path: cache.pathOf(entry), hash: entry.contentHash, mimeType: img.mimeType };
  }
}
