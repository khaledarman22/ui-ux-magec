import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { AssetLibrarySchema, ID_PREFIX, newId, nowIso, type AssetRecord } from '@ui-ux-magec/schemas';
import { atomicWriteFile, ensureDir, readJsonOr, writeJson, type Workspace } from '@ui-ux-magec/workspace';

export const ASSET_LIBRARY_PATH = 'assets/assets.json';
const EMPTY = { version: 1 as const, assets: [] as AssetRecord[] };

/** Detects the image type from magic bytes; the file extension is never trusted. */
export function sniffImage(bytes: Uint8Array): { mimeType: string; ext: string } | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mimeType: 'image/png', ext: '.png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mimeType: 'image/jpeg', ext: '.jpg' };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { mimeType: 'image/gif', ext: '.gif' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mimeType: 'image/webp', ext: '.webp' };
  return null;
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'asset';
}

/**
 * The project's asset library: the files live in the visible assets/ folder and assets/assets.json records
 * where each came from (source page, author, license, or the tool and prompt that generated it).
 */
export class AssetStore {
  constructor(private readonly ws: Workspace) {}

  private get file(): string {
    return this.ws.resolveProject(ASSET_LIBRARY_PATH);
  }

  async list(filter: { kind?: AssetRecord['kind'] } = {}): Promise<AssetRecord[]> {
    const lib = await readJsonOr(this.file, AssetLibrarySchema, EMPTY);
    return lib.assets.filter((a) => (!filter.kind || a.kind === filter.kind) && existsSync(this.ws.resolveProject(a.path)));
  }

  async get(assetId: string): Promise<AssetRecord | undefined> {
    return (await this.list()).find((a) => a.assetId === assetId);
  }

  /**
   * Writes bytes under assets/<dir>/ and records them. Identical content is stored once: adding the same
   * file again returns the existing record instead of creating a duplicate.
   */
  async add(bytes: Uint8Array, dir: 'images' | 'icons' | 'references', fileStem: string, ext: string, meta: Omit<AssetRecord, 'assetId' | 'path' | 'sha256' | 'addedAt'>): Promise<{ record: AssetRecord; duplicate: boolean }> {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return this.ws.locks.withLock('assets', `assets-${process.pid}`, async () => {
      const lib = await readJsonOr(this.file, AssetLibrarySchema, EMPTY);
      const existing = lib.assets.find((a) => a.sha256 === sha256 && a.kind === meta.kind && existsSync(this.ws.resolveProject(a.path)));
      if (existing) return { record: existing, duplicate: true };
      let rel = `assets/${dir}/${slugify(fileStem)}${ext}`;
      if (existsSync(this.ws.resolveProject(rel))) rel = `assets/${dir}/${slugify(fileStem)}-${sha256.slice(0, 8)}${ext}`;
      await ensureDir(this.ws.resolveProject(`assets/${dir}`));
      await atomicWriteFile(this.ws.resolveProject(rel), bytes);
      const record: AssetRecord = { ...meta, assetId: newId(ID_PREFIX.asset), path: rel, sha256, addedAt: nowIso() };
      lib.assets = [...lib.assets.filter((a) => a.path !== rel), record];
      await writeJson(this.file, lib);
      return { record, duplicate: false };
    });
  }

  /** Resolves a user-supplied path (absolute or project-relative) and refuses anything outside the project. */
  resolveInsideProject(path: string): string {
    const root = resolve(this.ws.root);
    const abs = isAbsolute(path) ? resolve(path) : resolve(root, path);
    const rel = relative(root, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${path} is outside the project folder`);
    if (rel.split(/[\\/]/)[0] === '.ui-ux-magec') throw new Error('files inside .ui-ux-magec/ cannot be registered as assets');
    return abs;
  }

  /** Permanent copy of a reference preview in assets/references (the cached copy may be pruned). */
  async keepReferencePreview(cachedPath: string, referenceId: string, sourcePage: string, addedBy: string): Promise<AssetRecord> {
    const bytes = new Uint8Array(await readFile(cachedPath));
    const kind = sniffImage(bytes);
    const { record } = await this.add(bytes, 'references', referenceId, kind?.ext ?? (extname(cachedPath) || '.img'), {
      kind: 'reference', purpose: 'inspiration only — never place in a design', origin: 'reference-preview', sourcePage, referenceId,
      mimeType: kind?.mimeType ?? 'application/octet-stream', addedBy,
    });
    return record;
  }
}

