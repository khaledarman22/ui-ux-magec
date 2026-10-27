import { FigmaBridgeError } from './errors.js';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Read-only Figma REST API client (requires a personal access token in FIGMA_TOKEN). Used to inspect existing
 * files when the plugin is not running. It cannot create or modify nodes — the REST API has no such endpoints.
 */
export class FigmaRestClient {
  constructor(private readonly token: string | undefined = process.env.FIGMA_TOKEN, private readonly fetchImpl: FetchLike = (u, i) => fetch(u, i)) {}

  get available(): boolean {
    return Boolean(this.token);
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.token) throw new FigmaBridgeError('not_configured', 'FIGMA_TOKEN is not set (needed for REST reads)');
    const res = await this.fetchImpl(`https://api.figma.com/v1${path}`, { headers: { 'X-Figma-Token': this.token } });
    if (res.status === 403) throw new FigmaBridgeError('permission_denied', 'Figma REST API rejected the token or file access');
    if (res.status === 404) throw new FigmaBridgeError('node_missing', `Figma resource not found: ${path}`);
    if (!res.ok) throw new FigmaBridgeError('plugin_error', `Figma REST HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  getFile(fileKey: string, depth = 2): Promise<{ name: string; lastModified: string; version: string; document: unknown; components: Record<string, unknown>; styles: Record<string, unknown> }> {
    return this.get(`/files/${encodeURIComponent(fileKey)}?depth=${depth}`);
  }

  getNodes(fileKey: string, ids: string[], depth = 3): Promise<{ nodes: Record<string, { document: unknown } | null> }> {
    return this.get(`/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(ids.join(','))}&depth=${depth}`);
  }

  renderImages(fileKey: string, ids: string[], scale = 1): Promise<{ images: Record<string, string | null> }> {
    return this.get(`/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(ids.join(','))}&format=png&scale=${scale}`);
  }
}
