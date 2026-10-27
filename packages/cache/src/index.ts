import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CacheEntrySchema, nowIso, z, type CacheCategory, type CacheEntry } from '@ui-ux-magec/schemas';
import { FileLockManager, atomicWriteFile, readJsonOr, sha256, writeJson } from '@ui-ux-magec/workspace';

const IndexSchema = z.object({ version: z.literal(1), entries: z.record(z.string(), CacheEntrySchema) });
type CacheIndex = z.infer<typeof IndexSchema>;

/** Default lifetimes. Figma data has no TTL: it is invalidated when the source node changes. */
export const DEFAULT_TTL_MS: Record<CacheCategory, number | undefined> = {
  'research-results': 7 * 24 * 3600_000,
  'reference-metadata': 14 * 24 * 3600_000,
  'reference-previews': 30 * 24 * 3600_000,
  'visual-analysis': undefined,
  'figma-metadata': undefined,
  'figma-nodes': undefined,
  'asset-processing': undefined,
  'agent-temp': 24 * 3600_000,
  'rendered-previews': undefined,
  robots: 24 * 3600_000,
};

export interface CacheSetOptions {
  source: string;
  ttlMs?: number | null;
  dependencies?: string[];
  contentVersion?: number;
  ext?: string;
}

export interface CacheHit<T> {
  entry: CacheEntry;
  value: T;
  stale: boolean;
}

/**
 * Project-local cache. Entries are disposable: callers must be able to recompute them, and nothing in the
 * cache is ever treated as authoritative project state (that lives in memory/ and the other state dirs).
 */
export class CacheService {
  private readonly locks: FileLockManager;
  constructor(private readonly dir: string, private readonly now: () => number = Date.now) {
    this.locks = new FileLockManager(join(dir, '.locks'));
  }

  private indexPath(): string {
    return join(this.dir, 'index.json');
  }

  private id(category: CacheCategory, key: string): string {
    return `${category}:${key}`;
  }

  private async readIndex(): Promise<CacheIndex> {
    try {
      return await readJsonOr(this.indexPath(), IndexSchema, { version: 1, entries: {} });
    } catch {
      // A corrupt cache index is not fatal: the cache is rebuilt from scratch.
      return { version: 1, entries: {} };
    }
  }

  private async mutateIndex<T>(fn: (index: CacheIndex) => T | Promise<T>): Promise<T> {
    return this.locks.withLock('cache-index', `pid-${process.pid}`, async () => {
      const index = await this.readIndex();
      const result = await fn(index);
      await writeJson(this.indexPath(), index);
      return result;
    }, { waitMs: 10_000 });
  }

  async set(category: CacheCategory, key: string, value: unknown, opts: CacheSetOptions): Promise<CacheEntry> {
    const binary = value instanceof Uint8Array;
    const data = binary ? (value as Uint8Array) : JSON.stringify(value);
    const contentHash = sha256(data);
    const payloadFile = `${sha256(this.id(category, key)).slice(0, 24)}${opts.ext ?? (binary ? '.bin' : '.json')}`;
    await atomicWriteFile(join(this.dir, category, payloadFile), data);
    const ttl = opts.ttlMs === null ? undefined : (opts.ttlMs ?? DEFAULT_TTL_MS[category]);
    const entry = CacheEntrySchema.parse({
      key, category, source: opts.source, createdAt: new Date(this.now()).toISOString(),
      expiresAt: ttl === undefined ? undefined : new Date(this.now() + ttl).toISOString(),
      contentVersion: opts.contentVersion ?? 1, contentHash, validation: 'valid', dependencies: opts.dependencies ?? [], payloadFile, binary,
    });
    await this.mutateIndex((index) => {
      index.entries[this.id(category, key)] = entry;
    });
    return entry;
  }

  async getEntry(category: CacheCategory, key: string): Promise<CacheEntry | null> {
    return (await this.readIndex()).entries[this.id(category, key)] ?? null;
  }

  /** Returns a valid, unexpired entry. Expired entries are returned only with `allowStale` and flagged `stale`. */
  async get<T = unknown>(category: CacheCategory, key: string, opts: { allowStale?: boolean; contentVersion?: number } = {}): Promise<CacheHit<T> | null> {
    const entry = await this.getEntry(category, key);
    if (!entry || entry.validation === 'invalid') return null;
    if (opts.contentVersion !== undefined && entry.contentVersion !== opts.contentVersion) return null;
    const expired = entry.expiresAt !== undefined && Date.parse(entry.expiresAt) <= this.now();
    const stale = expired || entry.validation === 'stale';
    if (stale && !opts.allowStale) return null;
    const file = join(this.dir, category, entry.payloadFile);
    if (!existsSync(file)) return null;
    const buf = await readFile(file);
    if (sha256(entry.binary ? buf : buf.toString('utf8')) !== entry.contentHash) {
      await this.invalidate(category, key);
      return null;
    }
    const value = (entry.binary ? new Uint8Array(buf) : JSON.parse(buf.toString('utf8'))) as T;
    return { entry, value, stale };
  }

  pathOf(entry: CacheEntry): string {
    return join(this.dir, entry.category, entry.payloadFile);
  }

  async getOrCompute<T>(category: CacheCategory, key: string, compute: () => Promise<T>, opts: CacheSetOptions): Promise<{ value: T; cached: boolean }> {
    const hit = await this.get<T>(category, key);
    if (hit) return { value: hit.value, cached: true };
    const value = await compute();
    await this.set(category, key, value, opts);
    return { value, cached: false };
  }

  async invalidate(category: CacheCategory, key: string): Promise<number> {
    return this.invalidateWhere((id) => id === this.id(category, key));
  }

  /**
   * Invalidates entries that declare `dependencyId` (e.g. `figma-node:12:34`), cascading to entries that
   * depend on the invalidated entries' keys.
   */
  async invalidateByDependency(dependencyId: string): Promise<number> {
    return this.mutateIndex((index) => {
      const invalid = new Set<string>([dependencyId]);
      let changed = 0;
      let grew = true;
      while (grew) {
        grew = false;
        for (const [id, entry] of Object.entries(index.entries)) {
          if (entry.validation === 'invalid') continue;
          if (entry.dependencies.some((d) => invalid.has(d))) {
            entry.validation = 'invalid';
            invalid.add(entry.key);
            invalid.add(id);
            changed++;
            grew = true;
          }
        }
      }
      return changed;
    });
  }

  private async invalidateWhere(pred: (id: string, e: CacheEntry) => boolean): Promise<number> {
    return this.mutateIndex((index) => {
      let n = 0;
      for (const [id, entry] of Object.entries(index.entries)) {
        if (entry.validation !== 'invalid' && pred(id, entry)) {
          entry.validation = 'invalid';
          n++;
        }
      }
      return n;
    });
  }

  async invalidateCategory(category: CacheCategory): Promise<number> {
    return this.invalidateWhere((_, e) => e.category === category);
  }

  /** Deletes payloads of invalid or expired entries. */
  async prune(): Promise<number> {
    const toDelete: CacheEntry[] = [];
    await this.mutateIndex((index) => {
      for (const [id, entry] of Object.entries(index.entries)) {
        const expired = entry.expiresAt !== undefined && Date.parse(entry.expiresAt) <= this.now();
        if (entry.validation === 'invalid' || expired) {
          toDelete.push(entry);
          delete index.entries[id];
        }
      }
    });
    for (const e of toDelete) await rm(join(this.dir, e.category, e.payloadFile), { force: true });
    return toDelete.length;
  }

  async stats(): Promise<Record<string, { valid: number; stale: number; invalid: number }>> {
    const index = await this.readIndex();
    const out: Record<string, { valid: number; stale: number; invalid: number }> = {};
    for (const e of Object.values(index.entries)) {
      const s = (out[e.category] ??= { valid: 0, stale: 0, invalid: 0 });
      const expired = e.expiresAt !== undefined && Date.parse(e.expiresAt) <= this.now();
      if (e.validation === 'invalid') s.invalid++;
      else if (expired || e.validation === 'stale') s.stale++;
      else s.valid++;
    }
    return out;
  }

  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
  }

  static nowIso = nowIso;
}
