import { existsSync } from 'node:fs';
import { cp, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CheckpointSchema, ID_PREFIX, ManifestSchema, ProjectSchema, ProjectStateSchema, SCHEMA_VERSION,
  newId, nowIso, slugify,
  type ArtifactKind, type Checkpoint, type Manifest, type Project, type ProjectState,
} from '@ui-ux-magec/schemas';
import { atomicWriteFile, ensureDir, hashJson, readJson, safeJoin, sha256, writeFileIfAbsent, writeJson } from './fs.js';
import { FileLockManager } from './lock.js';
import { ASSET_SUBDIRS, CHECKPOINT_PATHS, WORKSPACE_DIRNAME, WORKSPACE_SUBDIRS, WRITABLE_AREAS } from './paths.js';

export class WorkspaceNotFoundError extends Error {
  constructor(public readonly root: string) {
    super(`no ${WORKSPACE_DIRNAME} workspace in ${root}. Run "ui-ux-magec init" to start a new project.`);
  }
}
export class WorkspaceExistsError extends Error {
  constructor(public readonly root: string, public readonly projectId: string) {
    super(`a workspace already exists in ${root} (project ${projectId}). Use "ui-ux-magec resume", or delete it first.`);
  }
}
export class WorkspaceCorruptError extends Error {
  constructor(public readonly root: string, public readonly problems: string[]) {
    super(`workspace in ${root} is invalid:\n - ${problems.join('\n - ')}`);
  }
}

export interface InitOptions {
  name: string;
  brief?: string;
  languages?: Array<'en' | 'ar'>;
  direction?: 'ltr' | 'rtl' | 'both';
  mode?: 'new' | 'existing';
  existingDesignMode?: 'audit' | 'suggest' | 'extend';
  industry?: string;
  market?: string;
  figmaFileUrl?: string;
  settings?: Partial<Project['settings']>;
}

export interface WorkspaceValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function workspaceDir(root: string): string {
  return join(resolve(root), WORKSPACE_DIRNAME);
}

export function hasWorkspace(root: string): boolean {
  return existsSync(join(workspaceDir(root), 'project.json'));
}

/** Walks up from `start` to find the nearest project root containing a workspace. */
export function findWorkspaceRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (hasWorkspace(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function templateDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, '../../../workspace-template');
  return existsSync(candidate) ? candidate : null;
}

export function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } | null {
  const m = url.match(/figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/);
  if (!m?.[1]) return null;
  const node = url.match(/node-id=([0-9]+[-:][0-9]+)/);
  return { fileKey: m[1], ...(node?.[1] ? { nodeId: node[1].replace('-', ':') } : {}) };
}

/**
 * Deterministic workspace service. All low-level file integrity lives here (atomic writes, locking,
 * schema validation, manifest hashing) so agents never manipulate state files directly.
 */
export class Workspace {
  readonly root: string;
  readonly dir: string;
  readonly locks: FileLockManager;
  private constructor(root: string, private project: Project) {
    this.root = resolve(root);
    this.dir = workspaceDir(root);
    this.locks = new FileLockManager(join(this.dir, 'locks'));
  }

  static async init(root: string, opts: InitOptions): Promise<Workspace> {
    const absRoot = resolve(root);
    if (hasWorkspace(absRoot)) {
      const existing = JSON.parse(await readFile(join(workspaceDir(absRoot), 'project.json'), 'utf8')) as { projectId?: string };
      throw new WorkspaceExistsError(absRoot, existing.projectId ?? 'unknown');
    }
    const dir = workspaceDir(absRoot);
    for (const sub of WORKSPACE_SUBDIRS) await ensureDir(join(dir, sub));
    for (const sub of ASSET_SUBDIRS) await ensureDir(join(absRoot, sub));

    const now = nowIso();
    // A fresh id every time: a project re-created with the same name never inherits a deleted one.
    const projectId = newId(ID_PREFIX.project);
    const figma = opts.figmaFileUrl ? parseFigmaUrl(opts.figmaFileUrl) : null;
    const project = ProjectSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      projectId,
      name: opts.name,
      slug: slugify(opts.name),
      createdAt: now,
      updatedAt: now,
      brief: opts.brief ?? '',
      mode: opts.mode ?? (opts.figmaFileUrl ? 'existing' : 'new'),
      existingDesignMode: opts.existingDesignMode,
      languages: opts.languages ?? ['en'],
      direction: opts.direction ?? (opts.languages?.includes('ar') ? (opts.languages.includes('en') ? 'both' : 'rtl') : 'ltr'),
      industry: opts.industry,
      market: opts.market,
      status: 'initialized',
      figma: { pages: {}, ...(figma ? { fileKey: figma.fileKey, fileUrl: opts.figmaFileUrl } : {}) },
      settings: opts.settings ?? {},
    });
    const manifest: Manifest = { schemaVersion: SCHEMA_VERSION, projectId, createdAt: now, artifacts: {} };
    const state: ProjectState = ProjectStateSchema.parse({ schemaVersion: SCHEMA_VERSION, projectId, phase: 'initialized', updatedAt: now });

    await writeJson(join(dir, 'project.json'), project);
    await writeJson(join(dir, 'manifest.json'), manifest);
    await writeJson(join(dir, 'state.json'), state);

    const tpl = templateDir();
    if (tpl) {
      await cp(join(tpl, WORKSPACE_DIRNAME), dir, { recursive: true, force: false, errorOnExist: false });
      const readmeTpl = await readFile(join(tpl, 'README.md'), 'utf8').catch(() => null);
      if (readmeTpl) {
        await writeFileIfAbsent(join(absRoot, 'README.md'), readmeTpl.replaceAll('{{PROJECT_NAME}}', opts.name).replaceAll('{{PROJECT_ID}}', projectId).replaceAll('{{CREATED_AT}}', now));
      }
    }
    if (opts.brief) await atomicWriteFile(join(dir, 'planning', 'brief.md'), `# Brief\n\n${opts.brief}\n`);
    return new Workspace(absRoot, project);
  }

  static async open(root: string): Promise<Workspace> {
    const absRoot = resolve(root);
    if (!hasWorkspace(absRoot)) throw new WorkspaceNotFoundError(absRoot);
    try {
      const project = await readJson(join(workspaceDir(absRoot), 'project.json'), ProjectSchema);
      return new Workspace(absRoot, project);
    } catch (err) {
      throw new WorkspaceCorruptError(absRoot, [(err as Error).message]);
    }
  }

  get projectId(): string {
    return this.project.projectId;
  }

  getProject(): Project {
    return structuredClone(this.project);
  }

  /** Re-reads project.json, so changes made by another process (CLI vs MCP server) are seen. */
  async reloadProject(): Promise<Project> {
    this.project = await readJson(join(this.dir, 'project.json'), ProjectSchema);
    return this.getProject();
  }

  async updateProject(mutate: (p: Project) => void | Project): Promise<Project> {
    return this.locks.withLock('state:project', `pid-${process.pid}`, async () => {
      const current = await readJson(join(this.dir, 'project.json'), ProjectSchema);
      const next = mutate(current) ?? current;
      next.updatedAt = nowIso();
      const valid = ProjectSchema.parse(next);
      if (valid.projectId !== this.project.projectId) throw new Error('projectId is immutable');
      await writeJson(join(this.dir, 'project.json'), valid);
      this.project = valid;
      return this.getProject();
    });
  }

  async getState(): Promise<ProjectState> {
    return readJson(join(this.dir, 'state.json'), ProjectStateSchema);
  }

  async updateState(mutate: (s: ProjectState) => void): Promise<ProjectState> {
    return this.locks.withLock('state:state', `pid-${process.pid}`, async () => {
      const s = await this.getState();
      mutate(s);
      s.updatedAt = nowIso();
      const valid = ProjectStateSchema.parse(s);
      await writeJson(join(this.dir, 'state.json'), valid);
      return valid;
    });
  }

  async beginSession(): Promise<ProjectState> {
    return this.updateState((s) => {
      s.sessionCount += 1;
      s.lastSessionAt = nowIso();
    });
  }

  async markStage(stage: string): Promise<void> {
    await this.updateState((s) => {
      if (!s.completedStages.includes(stage)) s.completedStages.push(stage);
      s.phase = stage;
    });
  }

  /** Absolute path for a workspace-relative path; refuses traversal outside the workspace. */
  resolve(rel: string): string {
    return safeJoin(this.dir, rel);
  }

  /** Absolute path for a project-root-relative path (assets, README). */
  resolveProject(rel: string): string {
    return safeJoin(this.root, rel);
  }

  relative(abs: string): string {
    return relative(this.dir, abs);
  }

  async getManifest(): Promise<Manifest> {
    return readJson(join(this.dir, 'manifest.json'), ManifestSchema);
  }

  /**
   * Writes a structured artifact atomically and records it in the manifest. Only agent-writable areas are
   * accepted; service-owned state files must go through their services.
   */
  async writeArtifact(rel: string, data: unknown, meta: { kind: ArtifactKind; producedBy: string; taskId?: string }): Promise<{ path: string; hash: string }> {
    const area = rel.split('/')[0] ?? '';
    if (!(WRITABLE_AREAS as readonly string[]).includes(area)) throw new Error(`artifact path must be inside one of: ${WRITABLE_AREAS.join(', ')} (got "${rel}")`);
    const abs = this.resolve(rel);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n';
    await atomicWriteFile(abs, content);
    const hash = sha256(content);
    await this.locks.withLock('state:manifest', `pid-${process.pid}`, async () => {
      const manifest = await this.getManifest();
      manifest.artifacts[rel] = { path: rel, kind: meta.kind, hash, updatedAt: nowIso(), producedBy: meta.producedBy, ...(meta.taskId ? { taskId: meta.taskId } : {}) };
      await writeJson(join(this.dir, 'manifest.json'), manifest);
    });
    return { path: rel, hash };
  }

  async readArtifact(rel: string): Promise<string | null> {
    try {
      return await readFile(this.resolve(rel), 'utf8');
    } catch {
      return null;
    }
  }

  async readArtifactJson<T = unknown>(rel: string): Promise<T | null> {
    const raw = await this.readArtifact(rel);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async artifactExists(rel: string): Promise<boolean> {
    return existsSync(this.resolve(rel));
  }

  /** Moves artifacts aside (inside the workspace) when the user resets a scope. Nothing leaves the project folder. */
  async archiveArtifacts(rels: string[], reason: string): Promise<string[]> {
    const stamp = nowIso().replace(/[:.]/g, '-');
    const moved: string[] = [];
    for (const rel of rels) {
      const abs = this.resolve(rel);
      if (!existsSync(abs)) continue;
      const target = this.resolve(join('archive', stamp, rel));
      await ensureDir(dirname(target));
      await rename(abs, target);
      moved.push(rel);
    }
    if (moved.length) {
      await atomicWriteFile(this.resolve(join('archive', stamp, 'REASON.txt')), `${reason}\n`);
      await this.locks.withLock('state:manifest', `pid-${process.pid}`, async () => {
        const manifest = await this.getManifest();
        for (const rel of moved) delete manifest.artifacts[rel];
        await writeJson(join(this.dir, 'manifest.json'), manifest);
      });
    }
    return moved;
  }

  /* ---------- Checkpoints ---------- */

  async createCheckpoint(stage: string, label: string, taskSnapshot: Checkpoint['taskSnapshot']): Promise<Checkpoint> {
    const checkpointId = newId(ID_PREFIX.checkpoint);
    const target = this.resolve(join('checkpoints', checkpointId));
    await ensureDir(target);
    const files: string[] = [];
    for (const rel of CHECKPOINT_PATHS) {
      const abs = this.resolve(rel);
      if (!existsSync(abs)) continue;
      await cp(abs, join(target, rel), { recursive: true });
      files.push(rel);
    }
    const manifest = await this.getManifest();
    const checkpoint = CheckpointSchema.parse({
      checkpointId, projectId: this.projectId, stage, label, createdAt: nowIso(), taskSnapshot, manifestHash: hashJson(manifest), files,
    });
    await writeJson(join(target, 'checkpoint.json'), checkpoint);
    await this.updateState((s) => {
      s.lastCheckpointId = checkpointId;
    });
    return checkpoint;
  }

  async listCheckpoints(): Promise<Checkpoint[]> {
    const dir = this.resolve('checkpoints');
    if (!existsSync(dir)) return [];
    const out: Checkpoint[] = [];
    for (const name of await readdir(dir)) {
      const file = join(dir, name, 'checkpoint.json');
      if (!existsSync(file)) continue;
      try {
        out.push(await readJson(file, CheckpointSchema));
      } catch {
        // invalid checkpoints are skipped; validate() reports them
      }
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Latest checkpoint whose recorded files all still exist and that belongs to this project. */
  async latestValidCheckpoint(): Promise<Checkpoint | null> {
    const all = await this.listCheckpoints();
    for (let i = all.length - 1; i >= 0; i--) {
      const c = all[i]!;
      if (c.projectId !== this.projectId) continue;
      const base = this.resolve(join('checkpoints', c.checkpointId));
      if (c.files.every((f) => existsSync(join(base, f)))) return c;
    }
    return null;
  }

  /* ---------- Validation & deletion ---------- */

  async validate(): Promise<WorkspaceValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let project: Project | null = null;
    try {
      project = await readJson(join(this.dir, 'project.json'), ProjectSchema);
    } catch (err) {
      errors.push((err as Error).message);
    }
    for (const [file, schema] of [['manifest.json', ManifestSchema], ['state.json', ProjectStateSchema]] as const) {
      try {
        const data = await readJson(join(this.dir, file), schema);
        if (project && data.projectId !== project.projectId) errors.push(`${file} belongs to project ${data.projectId}, expected ${project.projectId}`);
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    for (const sub of WORKSPACE_SUBDIRS) if (!existsSync(join(this.dir, sub))) warnings.push(`missing directory ${sub}/ (will be recreated)`);
    try {
      const manifest = await this.getManifest();
      for (const [rel, entry] of Object.entries(manifest.artifacts)) {
        const abs = this.resolve(rel);
        if (!existsSync(abs)) {
          warnings.push(`manifest lists ${rel} but the file is missing`);
          continue;
        }
        const actual = sha256(await readFile(abs));
        if (actual !== entry.hash) warnings.push(`${rel} was modified outside the runtime (hash mismatch)`);
      }
    } catch {
      // already reported
    }
    for (const lock of await this.locks.list()) if (lock.stale) warnings.push(`stale lock "${lock.scope}" held by ${lock.owner}`);
    const tmpFiles = await findTmpFiles(this.dir);
    if (tmpFiles.length) warnings.push(`${tmpFiles.length} interrupted temp file(s) found`);
    return { ok: errors.length === 0, errors, warnings };
  }

  /** Repairs what can be repaired deterministically: missing dirs, stale locks, orphaned temp files. */
  async repair(): Promise<string[]> {
    const actions: string[] = [];
    for (const sub of WORKSPACE_SUBDIRS) {
      if (!existsSync(join(this.dir, sub))) {
        await ensureDir(join(this.dir, sub));
        actions.push(`recreated ${sub}/`);
      }
    }
    for (const scope of await this.locks.clearStale()) actions.push(`cleared stale lock ${scope}`);
    for (const f of await findTmpFiles(this.dir)) {
      await rm(f, { force: true });
      actions.push(`removed temp file ${relative(this.dir, f)}`);
    }
    return actions;
  }

  /**
   * Permanently deletes the workspace directory. Nothing is copied anywhere first: a deleted experiment
   * stays deleted. `includeAssets` also removes the project's assets/ folder.
   */
  async destroy(opts: { includeAssets?: boolean } = {}): Promise<void> {
    await rm(this.dir, { recursive: true, force: true });
    if (opts.includeAssets) await rm(join(this.root, 'assets'), { recursive: true, force: true });
  }
}

async function findTmpFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4 || !existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'checkpoints' || entry.name === 'archive') continue;
      out.push(...(await findTmpFiles(full, depth + 1)));
    } else if (entry.name.endsWith('.tmp')) {
      const s = await stat(full);
      if (Date.now() - s.mtimeMs > 60_000) out.push(full);
    }
  }
  return out;
}
