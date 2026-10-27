import type { FetchLike } from './fetcher.js';

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  provider: string;
}

export interface SearchProvider {
  readonly id: string;
  readonly available: boolean;
  readonly unavailableReason?: string;
  search(query: string, opts?: { count?: number }): Promise<SearchResult[]>;
}

/** Brave Search API (https://brave.com/search/api). Requires BRAVE_SEARCH_API_KEY; a free tier exists. */
export class BraveSearchProvider implements SearchProvider {
  readonly id = 'brave';
  constructor(private readonly apiKey: string | undefined = process.env.BRAVE_SEARCH_API_KEY, private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i)) {}

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  get unavailableReason(): string | undefined {
    return this.apiKey ? undefined : 'BRAVE_SEARCH_API_KEY is not set';
  }

  async search(query: string, opts: { count?: number } = {}): Promise<SearchResult[]> {
    if (!this.apiKey) throw new Error('Brave Search is not configured (BRAVE_SEARCH_API_KEY)');
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(opts.count ?? 10, 20)}&safesearch=moderate`;
    const res = await this.fetchImpl(url, { headers: { accept: 'application/json', 'x-subscription-token': this.apiKey } });
    if (!res.ok) throw new Error(`Brave Search HTTP ${res.status}`);
    const body = (await res.json()) as { web?: { results?: Array<{ url: string; title?: string; description?: string }> } };
    return (body.web?.results ?? []).map((r) => ({ url: r.url, title: stripTags(r.title ?? ''), snippet: stripTags(r.description ?? ''), provider: this.id }));
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

/**
 * Placeholder for hosts that search on the runtime's behalf (Claude Code WebSearch, a browser). It returns no
 * results itself; the host submits candidate URLs with `magec_research_submit_candidates`, which the runtime
 * then verifies by actually fetching them.
 */
export class HostSearchProvider implements SearchProvider {
  readonly id = 'host';
  readonly available = false;
  readonly unavailableReason = 'search is performed by the connected assistant; submit candidates with magec_research_submit_candidates';
  async search(): Promise<SearchResult[]> {
    return [];
  }
}
