import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CacheService } from '@ui-ux-magec/cache';
import { ReferenceVerifier, ResearchFetcher, RobotsPolicy, planQueries, sourceForUrl, type FetchLike } from '@ui-ux-magec/research';

/** MOCK network: a map of URL -> response. Anything else is a 404. Records every requested URL. */
function mockFetch(routes: Record<string, { status?: number; body?: string; type?: string }>) {
  const requested: string[] = [];
  const fn: FetchLike = async (url) => {
    requested.push(url);
    const r = routes[url];
    if (!r) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'text/html' } });
  };
  return { fn, requested };
}

const dirs: string[] = [];
const fetcher = (fetch: FetchLike) => {
  const d = mkdtempSync(join(tmpdir(), 'magec-research-'));
  dirs.push(d);
  return new ResearchFetcher({ cache: new CacheService(d), fetch, minHostIntervalMs: 0 });
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const page = (title: string, extra = '') => `<html><head><title>${title}</title><meta property="og:title" content="${title}"><meta property="og:image" content="https://cdn.example/p.png">${extra}</head><body><h1>${title}</h1><p>${'content '.repeat(50)}</p></body></html>`;

describe('research source validation', () => {
  it('parses robots.txt groups and longest-match rules', () => {
    const p = RobotsPolicy.parse('User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: ui-ux-magec\nDisallow: /no-bots');
    expect(p.isAllowed('/private/x', 'Mozilla')).toBe(false);
    expect(p.isAllowed('/private/ok/page', 'Mozilla')).toBe(true);
    expect(p.isAllowed('/no-bots', 'ui-ux-magec-research/0.1')).toBe(false);
  });

  it('verifies only pages that were actually retrieved', async () => {
    const { fn } = mockFetch({
      'https://studio.example/robots.txt': { body: 'User-agent: *\nAllow: /', type: 'text/plain' },
      'https://studio.example/work': { body: page('Studio work') },
    });
    const v = new ReferenceVerifier(fetcher(fn));
    const ok = await v.verify({ url: 'https://studio.example/work', category: 'hero-section', provider: 'host' });
    expect(ok.verified).toBe(true);
    expect(ok.title).toBe('Studio work');
    const missing = await v.verify({ url: 'https://studio.example/does-not-exist', category: 'hero-section', provider: 'host' });
    expect(missing.verified).toBe(false);
    expect(missing.failure).toBe('http-error');
  });

  it('respects robots.txt disallow rules', async () => {
    const { fn, requested } = mockFetch({ 'https://blocked.example/robots.txt': { body: 'User-agent: *\nDisallow: /', type: 'text/plain' }, 'https://blocked.example/page': { body: page('x') } });
    const r = await new ReferenceVerifier(fetcher(fn)).verify({ url: 'https://blocked.example/page', category: 'x', provider: 'host' });
    expect(r.verified).toBe(false);
    expect(r.failure).toBe('robots-disallowed');
    expect(requested).not.toContain('https://blocked.example/page');
  });

  it('never fetches login-only sources and flags login walls', async () => {
    const { fn, requested } = mockFetch({
      'https://walled.example/robots.txt': { body: '', type: 'text/plain' },
      'https://walled.example/p': { body: page('Sign in', '<form action="/login"><input type="password"></form>') },
    });
    const v = new ReferenceVerifier(fetcher(fn));
    const mobbin = await v.verify({ url: 'https://mobbin.com/screens/abc', category: 'x', provider: 'host' });
    expect(mobbin.verified).toBe(false);
    expect(requested.some((u) => u.includes('mobbin.com'))).toBe(false);
    expect(sourceForUrl('https://mobbin.com/screens/abc').access).toBe('login-required');
    const walled = await v.verify({ url: 'https://walled.example/p', category: 'x', provider: 'host' });
    expect(walled.verified).toBe(false);
    expect(walled.failure).toBe('login-wall');
  });

  it('plans feature-specific queries across sources and skips repeats', () => {
    const q = planQueries({ industry: 'real estate', categories: [{ category: 'filters', label: 'property search filters' }], perCategory: 3 });
    expect(q.length).toBeGreaterThanOrEqual(3);
    expect(q.every((x) => /real estate/i.test(x.query) && /filter/i.test(x.query))).toBe(true);
    expect(new Set(q.flatMap((x) => x.sources)).size).toBeGreaterThan(1);
    const again = planQueries({ industry: 'real estate', categories: [{ category: 'filters', label: 'property search filters' }], perCategory: 3, previousQueries: q.map((x) => x.query) });
    expect(again.some((x) => q.map((y) => y.query).includes(x.query))).toBe(false);
  });
});
