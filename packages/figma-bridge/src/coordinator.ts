import {
  FigmaNodeMappingSchema, FigmaOperationJournalEntrySchema, ID_PREFIX, hashJson, newId, nowIso, z,
  type FigmaNodeMapping, type FigmaOperation, type FigmaOperationJournalEntry, type FigmaOperationInput, type NodeSpec,
} from '@ui-ux-magec/schemas';
import { LockHeldError, appendJsonl, atomicWriteFile, readJsonl, readJsonOr, writeJson, type Workspace } from '@ui-ux-magec/workspace';
import { silentLogger, type Logger } from '@ui-ux-magec/logger';
import { FigmaBridgeError } from './errors.js';
import type { FigmaTransport } from './transport.js';

const MappingFileSchema = z.object({ version: z.literal(1), fileKey: z.string().optional(), mappings: z.array(FigmaNodeMappingSchema) });

/** Result shape of the plugin's `upsert_tree` operation. */
export interface UpsertResult {
  rootNodeId: string;
  nodes: Array<{ logicalId: string; nodeId: string; action: 'created' | 'updated' | 'unchanged'; type: string; name: string; fingerprint: string }>;
  conflicts?: Array<{ logicalId: string; nodeId: string; expected: string; actual: string }>;
  warnings: string[];
  missingFonts: string[];
}

export interface FoundNode {
  logicalId: string;
  nodeId: string;
  type: string;
  name: string;
  fingerprint: string;
  pageId?: string;
}

export interface ApplyTreeInput {
  tree: NodeSpec;
  page: string;
  agent: string;
  taskId?: string;
  specHash?: string;
  /** Overwrite nodes that were edited in Figma since the last write. Requires an approval id. */
  overwriteAuthorization?: string;
  pruneOwnedChildren?: boolean;
}

export interface ApplyTreeResult {
  operationId: string | null;
  rootNodeId: string;
  nodes: Array<{ logicalId: string; nodeId: string; action: 'created' | 'updated' | 'unchanged' }>;
  warnings: string[];
  missingFonts: string[];
  skipped: boolean;
}

export interface ReconcileReport {
  checkedAt: string;
  fileKey?: string;
  fileMatches: boolean;
  checked: number;
  ok: string[];
  missing: string[];
  changedExternally: string[];
  relinked: Array<{ logicalId: string; from: string; to: string }>;
  recoveredOperations: string[];
  abandonedOperations: string[];
}

/**
 * Serializes and tracks every Figma write for a project: verifies the connected file, takes a scope lock,
 * journals the operation before sending it, detects nodes edited outside ui-ux-magec, validates the result by
 * reading it back, and records logicalId -> nodeId mappings. Writes are idempotent because the plugin upserts
 * by logicalId stored in each node's pluginData.
 */
export class FigmaWriteCoordinator {
  private readonly log: Logger;
  constructor(private readonly ws: Workspace, private readonly transport: FigmaTransport, opts: { log?: Logger } = {}) {
    this.log = opts.log ?? silentLogger;
  }

  private get mappingFile(): string { return this.ws.resolve('figma/mappings.json'); }
  private get journalFile(): string { return this.ws.resolve('figma/operations.jsonl'); }

  async mappings(): Promise<FigmaNodeMapping[]> {
    return (await readJsonOr(this.mappingFile, MappingFileSchema, { version: 1, mappings: [] })).mappings;
  }

  async mapping(logicalId: string): Promise<FigmaNodeMapping | undefined> {
    return (await this.mappings()).find((m) => m.logicalId === logicalId);
  }

  private async saveMappings(update: (list: FigmaNodeMapping[]) => void): Promise<void> {
    await this.ws.locks.withLock('state:figma-mappings', `pid-${process.pid}`, async () => {
      const data = await readJsonOr(this.mappingFile, MappingFileSchema, { version: 1, mappings: [] });
      update(data.mappings);
      const fileKey = this.ws.getProject().figma.fileKey;
      await writeJson(this.mappingFile, { version: 1, ...(fileKey ? { fileKey } : {}), mappings: data.mappings });
    });
  }

  async journal(): Promise<FigmaOperationJournalEntry[]> {
    const { records } = await readJsonl(this.journalFile, FigmaOperationJournalEntrySchema);
    const latest = new Map<string, FigmaOperationJournalEntry>();
    for (const r of records) latest.set(r.operationId, r);
    return [...latest.values()];
  }

  private async journalWrite(e: FigmaOperationJournalEntry): Promise<void> {
    await appendJsonl(this.journalFile, FigmaOperationJournalEntrySchema.parse(e));
  }

  /** Confirms the plugin is connected to this project's Figma file (adopting it on first connection). */
  async ensureFile(): Promise<{ fileKey: string; fileName: string }> {
    const status = await this.transport.status();
    if (!status.connected || !status.plugin) throw new FigmaBridgeError('not_connected', status.detail ?? 'Figma plugin is not connected');
    const project = await this.ws.reloadProject();
    const pluginKey = status.plugin.fileKey ?? `name:${status.plugin.fileName}`;
    if (project.figma.fileKey && project.figma.fileKey !== pluginKey) {
      throw new FigmaBridgeError('conflict', `the plugin is open in "${status.plugin.fileName}" (${pluginKey}) but this project is linked to file ${project.figma.fileKey}. Open the linked file and run the plugin there.`);
    }
    if (!project.figma.fileKey || project.figma.fileName !== status.plugin.fileName) {
      await this.ws.updateProject((p) => {
        p.figma.fileKey = pluginKey;
        p.figma.fileName = status.plugin!.fileName;
      });
    }
    return { fileKey: pluginKey, fileName: status.plugin.fileName };
  }

  async ensurePage(name: string): Promise<string> {
    const { fileKey } = await this.ensureFile();
    const res = (await this.transport.request({ op: 'ensure_page', projectId: this.ws.projectId, name }, { idempotencyKey: `page:${fileKey}:${name}` })) as { pageId: string; created: boolean };
    await this.ws.updateProject((p) => {
      p.figma.pages[name] = res.pageId;
      p.figma.lastSyncedAt = nowIso();
    });
    return res.pageId;
  }

  async findByLogicalIds(logicalIds: string[]): Promise<FoundNode[]> {
    const out: FoundNode[] = [];
    for (let i = 0; i < logicalIds.length; i += 400) {
      const res = (await this.transport.request({ op: 'find_by_logical_ids', projectId: this.ws.projectId, logicalIds: logicalIds.slice(i, i + 400) })) as { found: FoundNode[] };
      out.push(...res.found);
    }
    return out;
  }

  private async withScopeLock<T>(scope: string, owner: string, fn: () => Promise<T>): Promise<T> {
    try {
      await this.ws.locks.acquire(scope, owner, 5 * 60_000);
    } catch (err) {
      if (err instanceof LockHeldError) throw new FigmaBridgeError('locked', `Figma scope ${scope} is being written by ${err.holder.owner}`);
      throw err;
    }
    try {
      return await fn();
    } finally {
      await this.ws.locks.release(scope, owner);
    }
  }

  async applyTree(input: ApplyTreeInput): Promise<ApplyTreeResult> {
    const { fileKey } = await this.ensureFile();
    const pageId = await this.ensurePage(input.page);
    const root = input.tree.logicalId;
    const scope = `figma:${fileKey}:page:${input.page}:${root}`;
    const owner = input.taskId ?? input.agent;
    const specHash = input.specHash ?? hashJson(input.tree);
    const logicalIds = collectLogicalIds(input.tree);

    return this.withScopeLock(scope, owner, async () => {
      await this.recoverPending(logicalIds);
      const known = new Map((await this.mappings()).map((m) => [m.logicalId, m]));
      const rootMapping = known.get(root);
      // Idempotency: identical spec already applied and node untouched in Figma -> nothing to write.
      if (rootMapping?.specHash === specHash && rootMapping.status === 'active') {
        const [found] = await this.findByLogicalIds([root]);
        if (found && found.fingerprint === rootMapping.fingerprint) {
          return { operationId: null, rootNodeId: found.nodeId, nodes: logicalIds.map((l) => ({ logicalId: l, nodeId: known.get(l)?.nodeId ?? '', action: 'unchanged' as const })), warnings: [], missingFonts: [], skipped: true };
        }
      }
      const expectedFingerprints: Record<string, string> = {};
      if (!input.overwriteAuthorization) {
        for (const l of logicalIds) {
          const m = known.get(l);
          if (m?.fingerprint && m.status !== 'deleted') expectedFingerprints[l] = m.fingerprint;
        }
      }
      const operationId = newId(ID_PREFIX.operation);
      const idempotencyKey = hashJson({ project: this.ws.projectId, root, specHash, task: input.taskId ?? null });
      const base: FigmaOperationJournalEntry = { operationId, idempotencyKey, op: 'upsert_tree', agent: input.agent, scope, status: 'pending', logicalIds, startedAt: nowIso(), ...(input.taskId ? { taskId: input.taskId } : {}) };
      await this.journalWrite(base);
      let result: UpsertResult;
      try {
        result = (await this.transport.request({
          op: 'upsert_tree', projectId: this.ws.projectId, parent: { pageId }, tree: input.tree,
          expectedFingerprints, pruneOwnedChildren: input.pruneOwnedChildren ?? false,
        }, { idempotencyKey, timeoutMs: 120_000 })) as UpsertResult;
      } catch (err) {
        const e = err as FigmaBridgeError;
        // A timeout leaves the outcome unknown: keep the entry pending so recovery can check Figma.
        await this.journalWrite({ ...base, status: e.code === 'timeout' ? 'pending' : 'failed', error: e.message, finishedAt: nowIso() });
        throw err;
      }
      if (result.conflicts?.length) {
        await this.journalWrite({ ...base, status: 'failed', error: `conflict: ${result.conflicts.length} node(s) edited in Figma`, finishedAt: nowIso() });
        await this.saveMappings((list) => {
          for (const c of result.conflicts!) {
            const m = list.find((x) => x.logicalId === c.logicalId);
            if (m) Object.assign(m, { status: 'changed-externally', updatedAt: nowIso() });
          }
        });
        throw new FigmaBridgeError('conflict', `refused to overwrite ${result.conflicts.length} node(s) edited in Figma since the last write: ${result.conflicts.slice(0, 5).map((c) => c.logicalId).join(', ')}. Get user approval to overwrite, or write the change to a new frame.`, result.conflicts);
      }
      // Post-write validation: read back every logical id and require all to exist.
      const found = await this.findByLogicalIds(logicalIds);
      const foundIds = new Set(found.map((f) => f.logicalId));
      const missing = logicalIds.filter((l) => !foundIds.has(l));
      if (missing.length) {
        await this.journalWrite({ ...base, status: 'failed', error: `post-write validation: ${missing.length} node(s) missing`, finishedAt: nowIso() });
        throw new FigmaBridgeError('plugin_error', `Figma reported success but ${missing.length} node(s) are missing on read-back: ${missing.slice(0, 5).join(', ')}`);
      }
      const byLogical = new Map(found.map((f) => [f.logicalId, f]));
      await this.saveMappings((list) => {
        for (const n of result.nodes) {
          const f = byLogical.get(n.logicalId)!;
          const entry: FigmaNodeMapping = {
            logicalId: n.logicalId, nodeId: f.nodeId, fileKey, pageId, type: n.type, name: n.name, fingerprint: f.fingerprint,
            ...(n.logicalId === root ? { specHash } : {}), status: 'active', ...(input.taskId ? { taskId: input.taskId } : {}), updatedAt: nowIso(),
          };
          const i = list.findIndex((m) => m.logicalId === n.logicalId);
          if (i >= 0) list[i] = entry;
          else list.push(entry);
        }
      });
      await this.journalWrite({ ...base, status: 'confirmed', finishedAt: nowIso() });
      this.log.info('figma tree applied', { root, created: result.nodes.filter((n) => n.action === 'created').length, updated: result.nodes.filter((n) => n.action === 'updated').length });
      return {
        operationId,
        rootNodeId: byLogical.get(root)?.nodeId ?? result.rootNodeId,
        nodes: result.nodes.map((n) => ({ logicalId: n.logicalId, nodeId: byLogical.get(n.logicalId)!.nodeId, action: n.action })),
        warnings: result.warnings,
        missingFonts: result.missingFonts,
        skipped: false,
      };
    });
  }

  /**
   * Settles operations left `pending` by a crash or timeout: if their nodes exist in Figma they are adopted,
   * otherwise the entry is abandoned. Either way a retry cannot duplicate nodes (upsert by logicalId).
   */
  async recoverPending(onlyFor?: string[]): Promise<{ recovered: string[]; abandoned: string[] }> {
    const pending = (await this.journal()).filter((j) => j.status === 'pending' && (!onlyFor || j.logicalIds.some((l) => onlyFor.includes(l))));
    const recovered: string[] = [];
    const abandoned: string[] = [];
    for (const entry of pending) {
      const found = await this.findByLogicalIds(entry.logicalIds);
      if (entry.logicalIds.length && found.length === entry.logicalIds.length) {
        const fileKey = this.ws.getProject().figma.fileKey ?? 'unknown';
        await this.saveMappings((list) => {
          for (const f of found) {
            const i = list.findIndex((m) => m.logicalId === f.logicalId);
            const entryMap: FigmaNodeMapping = { logicalId: f.logicalId, nodeId: f.nodeId, fileKey, ...(f.pageId ? { pageId: f.pageId } : {}), type: f.type, name: f.name, fingerprint: f.fingerprint, status: 'active', updatedAt: nowIso(), ...(entry.taskId ? { taskId: entry.taskId } : {}) };
            if (i >= 0) list[i] = { ...list[i]!, ...entryMap };
            else list.push(entryMap);
          }
        });
        await this.journalWrite({ ...entry, status: 'recovered', finishedAt: nowIso() });
        recovered.push(entry.operationId);
      } else {
        await this.journalWrite({ ...entry, status: 'abandoned', error: `${found.length}/${entry.logicalIds.length} nodes present after interruption`, finishedAt: nowIso() });
        abandoned.push(entry.operationId);
      }
    }
    return { recovered, abandoned };
  }

  /**
   * Compares local mappings with the live document. Reports missing and externally edited nodes; it never
   * recreates anything — a deleted design stays deleted until a task explicitly redesigns it.
   */
  async reconcile(): Promise<ReconcileReport> {
    const project = await this.ws.reloadProject();
    const report: ReconcileReport = { checkedAt: nowIso(), fileMatches: false, checked: 0, ok: [], missing: [], changedExternally: [], relinked: [], recoveredOperations: [], abandonedOperations: [], ...(project.figma.fileKey ? { fileKey: project.figma.fileKey } : {}) };
    await this.ensureFile();
    report.fileMatches = true;
    const pending = await this.recoverPending();
    report.recoveredOperations = pending.recovered;
    report.abandonedOperations = pending.abandoned;
    const mappings = (await this.mappings()).filter((m) => m.status !== 'deleted');
    report.checked = mappings.length;
    const found = new Map((await this.findByLogicalIds(mappings.map((m) => m.logicalId))).map((f) => [f.logicalId, f]));
    await this.saveMappings((list) => {
      for (const m of list) {
        if (m.status === 'deleted') continue;
        const f = found.get(m.logicalId);
        if (!f) {
          m.status = 'missing';
          report.missing.push(m.logicalId);
        } else {
          if (f.nodeId !== m.nodeId) {
            report.relinked.push({ logicalId: m.logicalId, from: m.nodeId, to: f.nodeId });
            m.nodeId = f.nodeId;
          }
          if (m.fingerprint && f.fingerprint !== m.fingerprint) {
            m.status = 'changed-externally';
            report.changedExternally.push(m.logicalId);
          } else {
            m.status = 'active';
            report.ok.push(m.logicalId);
          }
        }
        m.updatedAt = nowIso();
      }
    });
    await writeJson(this.ws.resolve('figma/reconcile.json'), report);
    return report;
  }

  /** Accepts the current Figma state of externally edited nodes as the new baseline (user approved). */
  async acceptExternalChanges(logicalIds: string[]): Promise<number> {
    const found = new Map((await this.findByLogicalIds(logicalIds)).map((f) => [f.logicalId, f]));
    let n = 0;
    await this.saveMappings((list) => {
      for (const m of list) {
        const f = found.get(m.logicalId);
        if (!f || !logicalIds.includes(m.logicalId)) continue;
        Object.assign(m, { fingerprint: f.fingerprint, nodeId: f.nodeId, status: 'active', specHash: undefined, updatedAt: nowIso() });
        n++;
      }
    });
    return n;
  }

  /** Deletes nodes this project created. `authorization` must be an approved approval-task id (checked by the caller). */
  async deleteNodes(logicalIds: string[], authorization: string, agent: string): Promise<{ deleted: string[]; skipped: string[] }> {
    await this.ensureFile();
    const mappings = await this.mappings();
    const targets = mappings.filter((m) => logicalIds.includes(m.logicalId) && m.status !== 'deleted');
    if (!targets.length) return { deleted: [], skipped: logicalIds };
    const operationId = newId(ID_PREFIX.operation);
    const base: FigmaOperationJournalEntry = { operationId, idempotencyKey: hashJson({ del: logicalIds, authorization }), op: 'delete_nodes', agent, scope: `figma:${this.ws.getProject().figma.fileKey}:delete`, status: 'pending', logicalIds, startedAt: nowIso(), taskId: authorization };
    await this.journalWrite(base);
    try {
      const res = (await this.transport.request({ op: 'delete_nodes', projectId: this.ws.projectId, nodeIds: targets.map((t) => t.nodeId), authorization, ownedOnly: true })) as { deleted: string[]; skipped: string[] };
      const deletedSet = new Set(res.deleted);
      await this.saveMappings((list) => {
        for (const m of list) if (deletedSet.has(m.nodeId)) Object.assign(m, { status: 'deleted', updatedAt: nowIso() });
      });
      await this.journalWrite({ ...base, status: 'confirmed', finishedAt: nowIso() });
      return { deleted: targets.filter((t) => deletedSet.has(t.nodeId)).map((t) => t.logicalId), skipped: targets.filter((t) => !deletedSet.has(t.nodeId)).map((t) => t.logicalId) };
    } catch (err) {
      await this.journalWrite({ ...base, status: 'failed', error: (err as Error).message, finishedAt: nowIso() });
      throw err;
    }
  }

  /** Journaled pass-through for other write operations (variables, styles, variants, images). */
  async write(operation: FigmaOperationInput & { op: 'upsert_variables' | 'upsert_text_styles' | 'upsert_paint_styles' | 'combine_as_variants' | 'import_image' }, meta: { agent: string; taskId?: string }): Promise<unknown> {
    const { fileKey } = await this.ensureFile();
    const operationId = newId(ID_PREFIX.operation);
    const scope = `figma:${fileKey}:${operation.op}`;
    const idempotencyKey = hashJson({ project: this.ws.projectId, operation });
    const base: FigmaOperationJournalEntry = { operationId, idempotencyKey, op: operation.op, agent: meta.agent, scope, status: 'pending', logicalIds: operation.op === 'combine_as_variants' ? [operation.logicalId] : [], startedAt: nowIso(), ...(meta.taskId ? { taskId: meta.taskId } : {}) };
    return this.withScopeLock(scope, meta.taskId ?? meta.agent, async () => {
      await this.journalWrite(base);
      try {
        const res = await this.transport.request(operation as FigmaOperation, { idempotencyKey });
        await this.journalWrite({ ...base, status: 'confirmed', finishedAt: nowIso() });
        if (operation.op === 'combine_as_variants') {
          const r = res as { nodeId: string; fingerprint: string };
          await this.saveMappings((list) => {
            const entry: FigmaNodeMapping = { logicalId: operation.logicalId, nodeId: r.nodeId, fileKey, type: 'COMPONENT_SET', name: operation.name, fingerprint: r.fingerprint, status: 'active', updatedAt: nowIso(), ...(meta.taskId ? { taskId: meta.taskId } : {}) };
            const i = list.findIndex((m) => m.logicalId === operation.logicalId);
            if (i >= 0) list[i] = entry;
            else list.push(entry);
          });
        }
        return res;
      } catch (err) {
        await this.journalWrite({ ...base, status: 'failed', error: (err as Error).message, finishedAt: nowIso() });
        throw err;
      }
    });
  }

  /** Exports a node as PNG into reports/previews/ for QA. Returns the workspace-relative path. */
  async exportPreview(nodeId: string, name: string, scale = 1): Promise<{ path: string; bytes: number }> {
    const res = (await this.transport.request({ op: 'export_node', nodeId, format: 'PNG', scale }, { timeoutMs: 120_000 })) as { base64: string };
    const buf = Buffer.from(res.base64, 'base64');
    const rel = `reports/previews/${name.replace(/[^a-z0-9._-]+/gi, '-')}.png`;
    await atomicWriteFile(this.ws.resolve(rel), buf);
    return { path: rel, bytes: buf.byteLength };
  }
}

export function collectLogicalIds(tree: NodeSpec): string[] {
  const out: string[] = [tree.logicalId];
  for (const c of tree.children ?? []) out.push(...collectLogicalIds(c));
  return out;
}
