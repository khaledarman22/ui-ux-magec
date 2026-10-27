import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { defineTool } from '@ui-ux-magec/agent-core';
import { ArtifactKindSchema, LanguageSchema, z } from '@ui-ux-magec/schemas';
import { WRITABLE_AREAS } from '@ui-ux-magec/workspace';
import type { MagecRuntime } from '../runtime.js';

export function projectTools(rt: MagecRuntime) {
  return [
    defineTool({
      name: 'magec_project_init',
      description: 'Create a NEW project workspace (.ui-ux-magec/) in the current project folder. Always creates a new project id; fails if a workspace already exists. Never use it to restore a deleted project.',
      permissions: ['tasks.manage'],
      input: z.object({
        name: z.string().min(1),
        brief: z.string().default(''),
        languages: z.array(LanguageSchema).min(1).default(['en']),
        direction: z.enum(['ltr', 'rtl', 'both']).optional(),
        industry: z.string().optional(),
        market: z.string().optional(),
        figmaFileUrl: z.string().optional(),
        conceptSelection: z.enum(['auto', 'user']).default('auto'),
        breakpoints: z.array(z.enum(['desktop', 'tablet', 'mobile'])).default(['desktop', 'mobile']),
        themes: z.array(z.enum(['light', 'dark'])).default(['light']),
      }),
      handler: async (i) => {
        const p = await rt.initProject({
          name: i.name, brief: i.brief, languages: i.languages, ...(i.direction ? { direction: i.direction } : {}), ...(i.industry ? { industry: i.industry } : {}),
          ...(i.market ? { market: i.market } : {}), ...(i.figmaFileUrl ? { figmaFileUrl: i.figmaFileUrl } : {}),
          settings: { conceptSelection: i.conceptSelection, breakpoints: i.breakpoints, themes: i.themes },
        });
        return { project: p.ws.getProject(), workspace: p.ws.dir, next: 'Put brand assets in assets/logos and assets/images, then call magec_plan_workflow {kind:"new-project"}.' };
      },
    }),
    defineTool({
      name: 'magec_project_status',
      description: 'Project summary: status, completed stages, task counts, next ready tasks, approvals waiting, failures.',
      permissions: ['tasks.read'],
      input: z.object({}),
      handler: async () => {
        if (!rt.hasProject) await rt.reload();
        if (!rt.hasProject) return { project: null, message: `no workspace in ${rt.projectDir}` };
        const { ws, tasks } = rt.requireProject();
        const project = await ws.reloadProject();
        const state = await ws.getState();
        const all = await tasks.list();
        return {
          project: { id: project.projectId, name: project.name, status: project.status, mode: project.mode, languages: project.languages, direction: project.direction, figma: project.figma },
          stages: state.completedStages,
          lastCheckpoint: state.lastCheckpointId ?? null,
          counts: await tasks.summary(),
          ready: (await tasks.ready()).slice(0, 15).map((t) => ({ taskId: t.taskId, agent: t.agent, type: t.type, title: t.title })),
          running: all.filter((t) => t.status === 'running').map((t) => ({ taskId: t.taskId, agent: t.agent, title: t.title })),
          waitingForApproval: all.filter((t) => t.status === 'waiting_for_approval').map((t) => ({ taskId: t.taskId, title: t.title })),
          failed: all.filter((t) => t.status === 'failed').map((t) => ({ taskId: t.taskId, title: t.title, error: t.errors.at(-1)?.message })),
          blocked: all.filter((t) => t.status === 'blocked').map((t) => ({ taskId: t.taskId, title: t.title })),
        };
      },
    }),
    defineTool({
      name: 'magec_project_context',
      description: 'Concise project context reconstructed from the workspace (brief, decisions, rejected directions, assumptions, feedback, artifacts). Pass taskId for task-specific context.',
      permissions: ['workspace.read'],
      input: z.object({ taskId: z.string().optional() }),
      handler: async (i) => {
        const { tasks, orchestrator } = rt.requireProject();
        return { context: await orchestrator.contextPack(i.taskId ? await tasks.get(i.taskId) : undefined) };
      },
    }),
    defineTool({
      name: 'magec_artifact_read',
      description: 'Read a workspace artifact by workspace-relative path (e.g. planning/product-analysis.json).',
      permissions: ['workspace.read'],
      input: z.object({ path: z.string().min(1), maxChars: z.number().int().positive().max(400_000).default(120_000) }),
      handler: async (i) => {
        const { ws } = rt.requireProject();
        const content = await ws.readArtifact(i.path);
        if (content === null) throw new Error(`artifact ${i.path} not found`);
        return { path: i.path, truncated: content.length > i.maxChars, content: content.slice(0, i.maxChars) };
      },
    }),
    defineTool({
      name: 'magec_artifact_write',
      description: `Write a supporting artifact (notes, drafts, design specs). Allowed areas: ${WRITABLE_AREAS.join(', ')}. Task outputs must go through magec_task_complete instead.`,
      permissions: ['workspace.write'],
      input: z.object({ path: z.string().min(1), content: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]), kind: ArtifactKindSchema.default('other'), taskId: z.string().optional() }),
      handler: async (i, ctx) => {
        const { ws } = rt.requireProject();
        return ws.writeArtifact(i.path, i.content, { kind: i.kind, producedBy: ctx.agentId, ...(i.taskId ? { taskId: i.taskId } : {}) });
      },
    }),
    defineTool({
      name: 'magec_asset_list',
      description: 'List user-provided project assets (assets/logos, assets/images, assets/icons) with absolute paths, so images can be inspected visually.',
      permissions: ['workspace.read'],
      input: z.object({}),
      handler: async () => {
        const { ws } = rt.requireProject();
        const out: Array<{ path: string; absolutePath: string; bytes: number }> = [];
        const walk = async (dir: string, depth: number) => {
          if (depth > 3) return;
          let entries: string[] = [];
          try {
            entries = await readdir(dir);
          } catch {
            return;
          }
          for (const e of entries) {
            if (e.startsWith('.')) continue;
            const full = join(dir, e);
            const s = await stat(full);
            if (s.isDirectory()) await walk(full, depth + 1);
            else out.push({ path: relative(ws.root, full), absolutePath: full, bytes: s.size });
          }
        };
        await walk(ws.resolveProject('assets'), 0);
        return { assets: out };
      },
    }),
    defineTool({
      name: 'magec_memory_search',
      description: 'Search project memory (decisions, assumptions, feedback) by keywords.',
      permissions: ['workspace.read'],
      input: z.object({ query: z.string().default(''), kinds: z.array(z.enum(['decision', 'assumption', 'feedback'])).optional(), limit: z.number().int().min(1).max(50).default(10) }),
      handler: async (i) => ({ hits: await rt.requireProject().memory.search(i.query, { limit: i.limit, ...(i.kinds ? { kinds: i.kinds } : {}) }) }),
    }),
    defineTool({
      name: 'magec_decision_record',
      description: 'Record a design/product decision with rationale and scope (project, page:<slug>, section:<id>). Use status "proposed" for suggestions awaiting the user.',
      permissions: ['memory.write'],
      input: z.object({
        topic: z.string(), decision: z.string(), rationale: z.string().default(''),
        status: z.enum(['proposed', 'accepted', 'rejected']).default('proposed'), scope: z.string().default('project'),
        referenceIds: z.array(z.string()).default([]), tags: z.array(z.string()).default([]), supersedes: z.string().optional(),
      }),
      handler: async (i, ctx) => rt.requireProject().memory.recordDecision({ ...i, source: 'agent', agentId: ctx.agentId }),
    }),
    defineTool({
      name: 'magec_assumption_record',
      description: 'Record an explicit assumption made because a requirement was missing.',
      permissions: ['memory.write'],
      input: z.object({ statement: z.string(), reason: z.string().default(''), impact: z.enum(['low', 'medium', 'high']).default('low') }),
      handler: async (i, ctx) => rt.requireProject().memory.recordAssumption({ ...i, agentId: ctx.agentId }),
    }),
    defineTool({
      name: 'magec_checkpoint_create',
      description: 'Create a checkpoint snapshot of persistent project state after a meaningful stage.',
      permissions: ['workspace.write'],
      input: z.object({ stage: z.string(), label: z.string() }),
      handler: async (i) => {
        const { ws, tasks } = rt.requireProject();
        const snap = (await tasks.list()).map((t) => ({ taskId: t.taskId, status: t.status, attempt: t.attempt }));
        return ws.createCheckpoint(i.stage, i.label, snap);
      },
    }),
  ];
}
