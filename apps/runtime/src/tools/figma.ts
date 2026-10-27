import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { defineTool } from '@ui-ux-magec/agent-core';
import { DesignSpecSchema, FIGMA_READ_OPS, FigmaOperationSchema, PaintSpecSchema, z, type DesignNode, type DesignSpec, type DesignTokens, type FigmaOperation, type Task } from '@ui-ux-magec/schemas';
import { sanitizeSvg, tintSvg } from '@ui-ux-magec/research';
import { AssetStore } from '../assets.js';
import { compileDesign, tokensToVariables } from '@ui-ux-magec/design-engine';
import { FigmaBridgeError, type ApplyTreeResult } from '@ui-ux-magec/figma-bridge';
import type { MagecRuntime, ProjectServices } from '../runtime.js';
import { loadTokens } from './design.js';
import { snapshotFigma } from '../deterministic.js';

/** Figma writes must happen inside a running task owned by the caller, so every mutation is attributable. */
async function requireWriteTask(rt: MagecRuntime, p: ProjectServices, taskId: string, agentId: string): Promise<Task> {
  const task = await p.tasks.get(taskId);
  if (task.status !== 'running') throw new Error(`task ${taskId} is ${task.status}; Figma writes need a running task (magec_task_start)`);
  if (task.agent !== agentId && !rt.agents.permissionsOf(agentId).has('tasks.manage')) throw new Error(`task ${taskId} belongs to ${task.agent}`);
  return task;
}

/** An approval is valid only if the user approved it (recorded by the approval flow). */
type FigmaImageType = 'image/png' | 'image/jpeg' | 'image/gif';

async function importImage(p: ProjectServices, assetPath: string, mimeType: FigmaImageType, agent: string, taskId: string): Promise<{ imageHash: string; cached?: boolean }> {
  const bytes = await readFile(p.ws.resolveProject(assetPath));
  const key = `figma-image:${assetPath}:${bytes.byteLength}`;
  const hit = await p.cache.get<{ imageHash: string }>('asset-processing', key);
  if (hit) return { ...hit.value, cached: true };
  const res = (await p.figma.write({ op: 'import_image', base64: bytes.toString('base64'), mimeType }, { agent, taskId })) as { imageHash: string };
  await p.cache.set('asset-processing', key, res, { source: assetPath, dependencies: [`figma-file:${p.ws.getProject().figma.fileKey}`] });
  return res;
}

/**
 * Replaces `image` / `icon` references to the asset library with what Figma needs: images are imported once
 * and become IMAGE fills; icons become sanitized SVG tinted with the node's color token.
 */
async function resolveAssets(p: ProjectServices, spec: DesignSpec, tokens: DesignTokens, agent: string, taskId: string): Promise<DesignSpec> {
  const library = await new AssetStore(p.ws).list();
  const known = new Set(library.filter((a) => a.kind !== 'reference').map((a) => a.path));
  const visit = async (n: DesignNode): Promise<DesignNode> => {
    let out: DesignNode = { ...n };
    if (n.image) {
      if (!known.has(n.image) && !n.image.startsWith('assets/logos/')) throw new Error(`${n.id}: "${n.image}" is not in the asset library (assets/assets.json)`);
      const ext = extname(n.image).toLowerCase();
      const mimeType: FigmaImageType | null = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
      if (!mimeType) throw new Error(`${n.id}: Figma accepts PNG, JPEG or GIF images, not ${ext}`);
      const { imageHash } = await importImage(p, n.image, mimeType, agent, taskId);
      const { image: _i, imageScale, ...rest } = out;
      out = { ...rest, fills: [{ type: 'IMAGE', imageHash, scaleMode: imageScale ?? 'FILL' }] };
    }
    if (n.icon) {
      if (!known.has(n.icon)) throw new Error(`${n.id}: "${n.icon}" is not in the asset library; fetch it with magec_icon_get`);
      const tint = n.color?.startsWith('$color.') ? tokens.color[n.color.slice(7)] : n.color;
      const svg = sanitizeSvg(await readFile(p.ws.resolveProject(n.icon), 'utf8'));
      const { icon: _c, ...rest } = out;
      out = { ...rest, type: 'SVG', svg: tintSvg(svg, tint ?? tokens.color.text ?? '#111111') };
    }
    if (n.children) out.children = await Promise.all(n.children.map(visit));
    return out;
  };
  return {
    ...spec,
    components: await Promise.all(spec.components.map(async (c) => ({ ...c, variants: await Promise.all(c.variants.map(async (v) => ({ ...v, node: await visit(v.node) }))) }))),
    screens: await Promise.all(spec.screens.map(async (sc) => ({ ...sc, sections: await Promise.all(sc.sections.map(visit)) }))),
  };
}

async function requireApproval(p: ProjectServices, approvalTaskId: string): Promise<void> {
  const t = await p.tasks.get(approvalTaskId);
  if (t.type !== 'approval' && t.type !== 'concept-approval') throw new Error(`${approvalTaskId} is not an approval task`);
  const record = await p.ws.readArtifactJson<{ approved?: boolean }>(`feedback/approval-${approvalTaskId}.json`);
  if (t.status !== 'completed' || record?.approved !== true) throw new Error(`approval ${approvalTaskId} has not been granted by the user`);
}

export function figmaTools(rt: MagecRuntime) {
  return [
    defineTool({
      name: 'magec_figma_status',
      description: 'Bridge/plugin connection status, the connected file, supported operations, and this project\'s Figma link. Call before any Figma work.',
      permissions: ['figma.read'],
      input: z.object({}),
      handler: async () => {
        const status = await rt.transport.status();
        const project = rt.hasProject ? rt.requireProject().ws.getProject() : null;
        return {
          bridge: status,
          project: project ? project.figma : null,
          rest: { available: rt.rest.available, note: 'REST is read-only; native editing requires the plugin' },
          fileMatches: project?.figma.fileKey && status.plugin ? (status.plugin.fileKey ?? `name:${status.plugin.fileName}`) === project.figma.fileKey : null,
        };
      },
    }),
    defineTool({
      name: 'magec_figma_read',
      description: `Run a read-only Figma operation (${FIGMA_READ_OPS.join(', ')}). export_node returns base64; prefer magec_figma_export_preview.`,
      permissions: ['figma.read'],
      input: z.object({ operation: z.record(z.string(), z.unknown()) }),
      handler: async (i) => {
        const op = FigmaOperationSchema.parse(i.operation);
        if (!(FIGMA_READ_OPS as readonly string[]).includes(op.op)) throw new FigmaBridgeError('permission_denied', `${op.op} is not a read operation`);
        return rt.transport.request(op as FigmaOperation);
      },
    }),
    defineTool({
      name: 'magec_figma_snapshot',
      description: 'Snapshot the connected Figma file (pages, frames, components, styles, variables) into the workspace and cache.',
      permissions: ['figma.read', 'workspace.write'],
      input: z.object({}),
      handler: async (_i, ctx) => {
        const p = rt.requireProject();
        const snap = await snapshotFigma(rt, p);
        await p.ws.writeArtifact('figma/snapshot.json', snap, { kind: 'other', producedBy: ctx.agentId });
        return { saved: 'figma/snapshot.json', summary: summarizeSnapshot(snap) };
      },
    }),
    defineTool({
      name: 'magec_figma_sync_tokens',
      description: 'Create/update Figma variables (colors per theme mode, spacing, radius) and text styles from the project design system. Idempotent.',
      permissions: ['figma.write'],
      input: z.object({ taskId: z.string(), collectionSuffix: z.string().optional() }),
      handler: async (i, ctx) => {
        const p = rt.requireProject();
        await requireWriteTask(rt, p, i.taskId, ctx.agentId);
        const tokens = await loadTokens(p);
        const vars = tokensToVariables(tokens);
        const collection = `${p.ws.getProject().name} tokens${i.collectionSuffix ? ` — ${i.collectionSuffix}` : ''}`;
        const variables = await p.figma.write({ op: 'upsert_variables', projectId: p.ws.projectId, collection, modes: vars.modes, variables: vars.variables }, { agent: ctx.agentId, taskId: i.taskId });
        const styles = Object.entries(tokens.typography).map(([name, t]) => ({ name: `type/${name}`, fontFamily: t.fontFamily, fontStyle: t.fontStyle, fontSize: t.fontSize, ...(t.lineHeight ? { lineHeight: t.lineHeight } : {}), ...(t.letterSpacing !== undefined ? { letterSpacing: t.letterSpacing } : {}) }));
        if (tokens.fonts.arabic) {
          for (const [name, t] of Object.entries(tokens.typography)) styles.push({ name: `type-ar/${name}`, fontFamily: tokens.fonts.arabic, fontStyle: t.fontStyle, fontSize: t.fontSize, ...(t.lineHeight ? { lineHeight: Math.round(t.lineHeight * 1.1) } : {}) });
        }
        const textStyles = await p.figma.write({ op: 'upsert_text_styles', projectId: p.ws.projectId, styles }, { agent: ctx.agentId, taskId: i.taskId });
        const journal = (await p.figma.journal()).filter((j) => j.taskId === i.taskId && j.status === 'confirmed');
        return { collection, variables, textStyles, operationIds: journal.map((j) => j.operationId) };
      },
    }),
    defineTool({
      name: 'magec_figma_apply_spec',
      description: 'Compile a design spec (inline or a saved figma/specs/*.json path) with the project tokens and upsert it into Figma as native, editable nodes (auto layout, text, components, variants). Idempotent by logicalId; refuses to overwrite nodes edited in Figma unless overwriteAuthorization (an approved approval task id) is given.',
      permissions: ['figma.write'],
      input: z.object({
        taskId: z.string(),
        specPath: z.string().optional(),
        spec: z.unknown().optional(),
        screens: z.array(z.string()).optional(),
        includeComponents: z.boolean().default(true),
        pageSuffix: z.string().optional(),
        overwriteAuthorization: z.string().optional(),
        pruneOwnedChildren: z.boolean().default(false),
      }),
      handler: async (i, ctx) => {
        const p = rt.requireProject();
        const task = await requireWriteTask(rt, p, i.taskId, ctx.agentId);
        if (i.overwriteAuthorization) await requireApproval(p, i.overwriteAuthorization);
        const raw = i.spec ?? (i.specPath ? await p.ws.readArtifactJson(i.specPath) : null);
        if (!raw) throw new Error('provide spec or specPath');
        const spec = DesignSpecSchema.parse(raw);
        const tokens = await loadTokens(p);
        const compiled = compileDesign(await resolveAssets(p, spec, tokens, ctx.agentId, task.taskId), tokens);
        const nodes: ApplyTreeResult['nodes'] = [];
        const operationIds: string[] = [];
        const warnings = [...compiled.warnings];
        const missingFonts = new Set<string>();
        const pageName = (page: string) => (i.pageSuffix ? `${page} — ${i.pageSuffix}` : page);
        const collect = (r: ApplyTreeResult) => {
          nodes.push(...r.nodes);
          if (r.operationId) operationIds.push(r.operationId);
          warnings.push(...r.warnings);
          r.missingFonts.forEach((f) => missingFonts.add(f));
        };
        const common = { agent: ctx.agentId, taskId: task.taskId, ...(i.overwriteAuthorization ? { overwriteAuthorization: i.overwriteAuthorization } : {}) };
        if (i.includeComponents) {
          for (const comp of compiled.components) {
            const variantNodeIds: string[] = [];
            for (const v of comp.variants) {
              const r = await p.figma.applyTree({ tree: v.tree, page: pageName(comp.page), specHash: v.specHash, ...common });
              collect(r);
              variantNodeIds.push(r.rootNodeId);
            }
            if (comp.variants.length > 1) {
              const res = (await p.figma.write({ op: 'combine_as_variants', projectId: p.ws.projectId, logicalId: comp.setLogicalId, name: comp.name, componentNodeIds: variantNodeIds }, { agent: ctx.agentId, taskId: task.taskId })) as { nodeId: string };
              nodes.push({ logicalId: comp.setLogicalId, nodeId: res.nodeId, action: 'updated' });
              const j = (await p.figma.journal()).filter((x) => x.taskId === task.taskId && x.op === 'combine_as_variants' && x.status === 'confirmed').at(-1);
              if (j) operationIds.push(j.operationId);
            }
          }
        }
        for (const screen of compiled.screens) {
          if (i.screens && !i.screens.includes(screen.screenId)) continue;
          collect(await p.figma.applyTree({ tree: screen.tree, page: pageName(screen.page), specHash: screen.specHash, pruneOwnedChildren: i.pruneOwnedChildren, ...common }));
        }
        if (i.spec && !i.specPath) await p.ws.writeArtifact(`figma/specs/${task.type}-${task.taskId}.json`, spec, { kind: 'design-spec', producedBy: ctx.agentId, taskId: task.taskId });
        if (missingFonts.size) warnings.push(`missing fonts replaced by Inter: ${[...missingFonts].join(', ')}`);
        return {
          operationIds, nodes, warnings, missingFonts: [...missingFonts],
          summary: { created: nodes.filter((n) => n.action === 'created').length, updated: nodes.filter((n) => n.action === 'updated').length, unchanged: nodes.filter((n) => n.action === 'unchanged').length },
        };
      },
    }),
    defineTool({
      name: 'magec_figma_update_nodes',
      description: 'Patch existing nodes (text, fills, size, visibility...). Nodes edited in Figma since the last write are refused (fingerprint check) unless overwriteAuthorization is given.',
      permissions: ['figma.write'],
      input: z.object({
        taskId: z.string(),
        updates: z.array(z.object({
          logicalId: z.string().optional(), nodeId: z.string().optional(),
          patch: z.object({
            name: z.string().optional(), x: z.number().optional(), y: z.number().optional(), width: z.number().positive().optional(), height: z.number().positive().optional(),
            visible: z.boolean().optional(), opacity: z.number().min(0).max(1).optional(), fills: z.array(PaintSpecSchema).optional(), characters: z.string().optional(), cornerRadius: z.number().min(0).optional(),
          }),
        })).min(1).max(100),
        overwriteAuthorization: z.string().optional(),
      }),
      handler: async (i, ctx) => {
        const p = rt.requireProject();
        await requireWriteTask(rt, p, i.taskId, ctx.agentId);
        if (i.overwriteAuthorization) await requireApproval(p, i.overwriteAuthorization);
        const mappings = new Map((await p.figma.mappings()).map((m) => [m.logicalId, m]));
        const updates = i.updates.map((u) => {
          const m = u.logicalId ? mappings.get(u.logicalId) : undefined;
          const nodeId = u.nodeId ?? m?.nodeId;
          if (!nodeId) throw new Error(`unknown node ${u.logicalId ?? '(no id)'}`);
          return { nodeId, ...(m?.fingerprint && !i.overwriteAuthorization ? { expectedFingerprint: m.fingerprint } : {}), patch: u.patch };
        });
        await p.figma.ensureFile();
        const res = (await rt.transport.request({ op: 'update_nodes', projectId: p.ws.projectId, updates })) as { updated: Array<{ nodeId: string; fingerprint: string }>; conflicts: unknown[] };
        if (res.conflicts.length) throw new FigmaBridgeError('conflict', `${res.conflicts.length} node(s) were edited in Figma; request approval before overwriting`, res.conflicts);
        return res;
      },
    }),
    defineTool({
      name: 'magec_figma_delete_nodes',
      description: 'Delete nodes this project created. Requires an approval task the user approved; never deletes user-made nodes.',
      permissions: ['figma.delete'],
      input: z.object({ taskId: z.string(), logicalIds: z.array(z.string()).min(1).max(200), approvalTaskId: z.string() }),
      handler: async (i, ctx) => {
        const p = rt.requireProject();
        await requireWriteTask(rt, p, i.taskId, ctx.agentId);
        await requireApproval(p, i.approvalTaskId);
        return p.figma.deleteNodes(i.logicalIds, i.approvalTaskId, ctx.agentId);
      },
    }),
    defineTool({
      name: 'magec_figma_import_image',
      description: 'Import a permitted image from the project assets/ folder into Figma; returns an imageHash to use in IMAGE fills.',
      permissions: ['figma.write'],
      input: z.object({ taskId: z.string(), assetPath: z.string().regex(/^assets\//) }),
      handler: async (i, ctx) => {
        const p = rt.requireProject();
        await requireWriteTask(rt, p, i.taskId, ctx.agentId);
        const ext = extname(i.assetPath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
        if (!mimeType) throw new Error('only PNG, JPEG and GIF can be imported (convert SVG logos to SVG nodes instead)');
        return importImage(p, i.assetPath, mimeType, ctx.agentId, i.taskId);
      },
    }),
    defineTool({
      name: 'magec_figma_export_preview',
      description: 'Export a node as PNG into reports/previews/ and return paths for visual QA.',
      permissions: ['figma.export'],
      input: z.object({ logicalId: z.string().optional(), nodeId: z.string().optional(), name: z.string(), scale: z.number().min(0.25).max(3).default(1) }),
      handler: async (i) => {
        const p = rt.requireProject();
        const nodeId = i.nodeId ?? (i.logicalId ? (await p.figma.mapping(i.logicalId))?.nodeId : undefined);
        if (!nodeId) throw new Error('unknown node');
        const r = await p.figma.exportPreview(nodeId, i.name, i.scale);
        return { ...r, absolutePath: p.ws.resolve(r.path) };
      },
    }),
    defineTool({
      name: 'magec_figma_reconcile',
      description: 'Compare recorded node mappings with the live Figma file: detect missing nodes and external edits, settle interrupted operations. Never recreates deleted designs.',
      permissions: ['figma.read'],
      input: z.object({}),
      handler: async () => rt.requireProject().figma.reconcile(),
    }),
    defineTool({
      name: 'magec_figma_accept_external_changes',
      description: 'After the user confirms, accept nodes edited in Figma as the new baseline so later writes do not report conflicts.',
      permissions: ['figma.write'],
      input: z.object({ logicalIds: z.array(z.string()).min(1), approvalTaskId: z.string() }),
      handler: async (i) => {
        const p = rt.requireProject();
        await requireApproval(p, i.approvalTaskId);
        return { accepted: await p.figma.acceptExternalChanges(i.logicalIds) };
      },
    }),
  ];
}

function summarizeSnapshot(snap: Record<string, unknown>): Record<string, unknown> {
  const doc = snap.document as { pages?: Array<{ name: string; childCount: number }> } | undefined;
  const comps = snap.components as { components?: unknown[] } | undefined;
  const vars = snap.variables as { variables?: unknown[] } | undefined;
  const styles = snap.styles as { paint?: unknown[]; text?: unknown[] } | undefined;
  return { pages: doc?.pages?.map((p) => `${p.name} (${p.childCount})`), components: comps?.components?.length ?? 0, variables: vars?.variables?.length ?? 0, paintStyles: styles?.paint?.length ?? 0, textStyles: styles?.text?.length ?? 0 };
}
