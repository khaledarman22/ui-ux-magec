import type { CacheService } from '@ui-ux-magec/cache';
import { silentLogger, type Logger } from '@ui-ux-magec/logger';
import { extractMetadata, type PageMetadata } from './metadata.js';
import { RobotsPolicy } from './robots.js';

export const USER_AGENT = 'ui-ux-magec-research/0.1 (+https://github.com/ui-ux-magec; local design research)';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetcherOptions {
  fetch?: FetchLike;
  cache?: CacheService;
  log?: Logger;
  /** Minimum delay between requests to the same host. */
  minHostIntervalMs?: number;
  timeoutMs?: number;
  maxHtmlBytes?: number;
  maxImageBytes?: number;
}

export interface PageResult {
  ok: boolean;
  url: string;
  status?: number;
  finalUrl?: string;
  metadata?: PageMetadata;
  failure?: 'robots-disallowed' | 'http-error' | 'login-wall' | 'not-html' | 'timeout' | 'network' | 'too-large' | 'invalid-url';
  detail?: string;
  fromCache: boolean;
  retrievedAt?: string;
}

/**
 * Polite HTTP fetcher for research: robots.txt is honoured, requests are rate limited per host, sizes are
 * capped and nothing authenticates or evades access controls. A page counts as retrieved only on a 2xx HTML
 * response that is not a login/paywall interstitial.
 */
export class ResearchFetcher {
  private readonly fetchImpl: FetchLike;
  private readonly log: Logger;
  private readonly lastHit = new Map<string, number>();
  private readonly robots = new Map<string, RobotsPolicy>();
  private readonly opts: Required<Pick<FetcherOptions, 'minHostIntervalMs' | 'timeoutMs' | 'maxHtmlBytes' | 'maxImageBytes'>>;

  constructor(private readonly options: FetcherOptions = {}) {
    this.fetchImpl = options.fetch ?? ((u, i) => fetch(u, i));
    this.log = options.log ?? silentLogger;
    this.opts = {
      minHostIntervalMs: options.minHostIntervalMs ?? 1500,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxHtmlBytes: options.maxHtmlBytes ?? 3_000_000,
      maxImageBytes: options.maxImageBytes ?? 8_000_000,
    };
  }

  private async throttle(host: string): Promise<void> {
    const last = this.lastHit.get(host) ?? 0;
    const wait = last + this.opts.minHostIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastHit.set(host, Date.now());
  }

  private async request(url: string, accept: string): Promise<Response> {
    const host = new URL(url).host;
    await this.throttle(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    try {
      return await this.fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept }, redirect: 'follow', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async robotsFor(origin: string): Promise<RobotsPolicy> {
    const memo = this.robots.get(origin);
    if (memo) return memo;
    const cached = await this.options.cache?.get<string>('robots', origin);
    let policy: RobotsPolicy;
    if (cached) {
      policy = RobotsPolicy.parse(cached.value);
    } else {
      let text = '';
      try {
        const res = await this.request(`${origin}/robots.txt`, 'text/plain');
        if (res.status >= 200 && res.status < 300) text = await res.text();
        // 4xx: no robots file, everything allowed. 5xx: be conservative and treat as disallowed.
        else if (res.status >= 500) text = 'User-agent: *\nDisallow: /';
      } catch {
        text = '';
      }
      await this.options.cache?.set('robots', origin, text, { source: `${origin}/robots.txt` });
      policy = RobotsPolicy.parse(text);
    }
    this.robots.set(origin, policy);
    return policy;
  }

  async isAllowed(url: string): Promise<boolean> {
    const u = new URL(url);
    const policy = await this.robotsFor(u.origin);
    return policy.isAllowed(`${u.pathname}${u.search}`, USER_AGENT);
  }

  async fetchPage(url: string, opts: { useCache?: boolean } = {}): Promise<PageResult> {
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('protocol');
    } catch {
      return { ok: false, url, failure: 'invalid-url', fromCache: false };
    }
    if (opts.useCache !== false) {
      const hit = await this.options.cache?.get<PageResult>('reference-metadata', url);
      if (hit) return { ...hit.value, fromCache: true };
    }
    if (!(await this.isAllowed(url))) return this.remember(url, { ok: false, url, failure: 'robots-disallowed', fromCache: false });
    let res: Response;
    try {
      res = await this.request(parsed.toString(), 'text/html,application/xhtml+xml');
    } catch (err) {
      const timeout = (err as Error).name === 'AbortError';
      return { ok: false, url, failure: timeout ? 'timeout' : 'network', detail: (err as Error).message, fromCache: false };
    }
    const finalUrl = res.url || url;
    if (res.status === 401 || res.status === 403) return this.remember(url, { ok: false, url, status: res.status, finalUrl, failure: 'login-wall', fromCache: false });
    if (res.status < 200 || res.status >= 300) return this.remember(url, { ok: false, url, status: res.status, finalUrl, failure: 'http-error', fromCache: false });
    const type = res.headers.get('content-type') ?? '';
    if (!/html|xml/i.test(type)) return { ok: false, url, status: res.status, finalUrl, failure: 'not-html', detail: type, fromCache: false };
    const html = await readCapped(res, this.opts.maxHtmlBytes);
    if (html === null) return { ok: false, url, status: res.status, finalUrl, failure: 'too-large', fromCache: false };
    const metadata = extractMetadata(new TextDecoder().decode(html), finalUrl);
    const finalPath = (() => { try { return new URL(finalUrl).pathname; } catch { return ''; } })();
    if (metadata.loginWall || /\/(login|signin|sign-in|signup|join)(\/|$)/i.test(finalPath)) {
      return this.remember(url, { ok: false, url, status: res.status, finalUrl, metadata, failure: 'login-wall', fromCache: false });
    }
    return this.remember(url, { ok: true, url, status: res.status, finalUrl, metadata, fromCache: false, retrievedAt: new Date().toISOString() });
  }

  private async remember(url: string, result: PageResult): Promise<PageResult> {
    await this.options.cache?.set('reference-metadata', url, result, { source: url, dependencies: [`url:${url}`] });
    return result;
  }

  /** Downloads an image (e.g. og:image) for local analysis. Robots rules of the image host apply. */
  /** Fetches a small text resource (e.g. an SVG icon) with robots.txt, throttling and a size cap. */
  async fetchText(url: string, accept = 'text/plain,*/*;q=0.5', maxBytes = 256 * 1024): Promise<{ ok: true; text: string; contentType: string } | { ok: false; reason: string }> {
    try {
      if (!(await this.isAllowed(url))) return { ok: false, reason: 'robots-disallowed' };
      const res = await this.request(url, accept);
      if (res.status < 200 || res.status >= 300) return { ok: false, reason: `http ${res.status}` };
      const bytes = await readCapped(res, maxBytes);
      if (!bytes) return { ok: false, reason: 'too-large' };
      return { ok: true, text: new TextDecoder().decode(bytes), contentType: (res.headers.get('content-type') ?? '').split(';')[0]!.trim() };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  async fetchImage(url: string): Promise<{ ok: true; bytes: Uint8Array; mimeType: string } | { ok: false; reason: string }> {
    try {
      if (!(await this.isAllowed(url))) return { ok: false, reason: 'robots-disallowed' };
      const res = await this.request(url, 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5');
      if (res.status < 200 || res.status >= 300) return { ok: false, reason: `http ${res.status}` };
      const mimeType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
      if (!/^image\/(png|jpeg|gif|webp)$/.test(mimeType)) return { ok: false, reason: `unsupported type ${mimeType}` };
      const bytes = await readCapped(res, this.opts.maxImageBytes);
      if (!bytes) return { ok: false, reason: 'too-large' };
      return { ok: true, bytes, mimeType };
    } catch (err) {
      this.log.warn('image fetch failed', { url, error: (err as Error).message });
      return { ok: false, reason: (err as Error).message };
    }
  }
}

async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > max) return null;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
