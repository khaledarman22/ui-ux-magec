import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MagecRuntime, McpServer, runAutonomous } from '@ui-ux-magec/runtime';
import { AnthropicExecutor, hasAnthropicCredentials } from '@ui-ux-magec/agent-core';
import { BridgeConnection, bridgeSettings, configPath, ensureConfig, updateConfig, DEFAULT_BRIDGE_PORT } from '@ui-ux-magec/figma-bridge';
import { Workspace, findWorkspaceRoot, globalHome } from '@ui-ux-magec/workspace';
import { CliError, confirm, type IO } from './io.js';
import { PLATFORMS, applyPlanned, describePlanned, planIntegration, type Platform } from './integrations.js';

export interface Flags {
  [k: string]: string | boolean | undefined;
}

export interface Ctx {
  io: IO;
  dir: string;
  flags: Flags;
  args: string[];
}

const str = (f: Flags, k: string): string | undefined => (typeof f[k] === 'string' ? (f[k] as string) : undefined);
const list = (f: Flags, k: string): string[] | undefined => str(f, k)?.split(',').map((s) => s.trim()).filter(Boolean);

async function runtime(ctx: Ctx, opts: { needProject?: boolean } = {}): Promise<MagecRuntime> {
  const rt = await MagecRuntime.create({ projectDir: ctx.dir, platform: 'cli', logLevel: ctx.flags.verbose ? 'debug' : 'warn' });
  if (opts.needProject !== false && !rt.hasProject) {
    const parent = findWorkspaceRoot(ctx.dir);
    await rt.close();
    throw new CliError(parent ? `no workspace here, but one exists in ${parent}; run the command there (or pass --dir)` : `no ui-ux-magec project in ${ctx.dir}. Run \`ui-ux-magec init "<name>"\` first.`);
  }
  return rt;
}

function printTasks(io: IO, tasks: Array<{ taskId: string; agent: string; title: string; status?: string }>): void {
  for (const t of tasks) io.out(`  ${t.taskId}  ${(t.status ?? '').padEnd(t.status ? 20 : 0)}${t.agent.padEnd(22)} ${t.title}`);
}

async function status(rt: MagecRuntime, io: IO): Promise<void> {
  const r = (await rt.tools.invoke('magec_project_status', {}, { agentId: 'master-orchestrator' }));
  if (!r.ok) throw new CliError(r.error.message);
  const s = r.result as Record<string, any>;
  if (!s.project) return io.out(s.message);
  const p = s.project;
  io.out(`${p.name}  (${p.id})`);
  io.out(`status ${p.status} · mode ${p.mode} · languages ${p.languages.join(', ')} · ${p.direction}`);
  io.out(`figma  ${p.figma.fileKey ? `${p.figma.fileName ?? ''} ${p.figma.fileUrl ?? p.figma.fileKey}` : 'not linked yet'}`);
  io.out(`stages ${s.stages.join(' → ') || 'none completed'}`);
  const c = s.counts;
  io.out(`tasks  ${c.total} total · ${c.completed} done · ${c.ready} ready · ${c.running} running · ${c.pending + c.blocked} waiting on deps · ${c.waiting_for_approval} need approval · ${c.failed} failed`);
  if (s.waitingForApproval.length) {
    io.out('\nNeeds your approval (ui-ux-magec approve <taskId>):');
    printTasks(io, s.waitingForApproval.map((t: any) => ({ ...t, agent: '' })));
  }
  if (s.failed.length) {
    io.out('\nFailed (ui-ux-magec retry <taskId>):');
    for (const t of s.failed) io.out(`  ${t.taskId}  ${t.title}\n      ${t.error ?? ''}`);
  }
  if (s.ready.length) {
    io.out('\nNext:');
    printTasks(io, s.ready);
  }
}

function hostHint(io: IO): void {
  io.out('\nContinue in your coding assistant (Claude Code, Codex or OpenCode) with the ui-ux-magec integration installed,');
  io.out('e.g. "continue the ui-ux-magec project", or run autonomously with --autonomous (needs ANTHROPIC_API_KEY).');
}

async function maybeRun(rt: MagecRuntime, ctx: Ctx): Promise<void> {
  if (!ctx.flags.autonomous) return hostHint(ctx.io);
  if (!hasAnthropicCredentials()) throw new CliError('autonomous mode needs Claude API credentials (ANTHROPIC_API_KEY). Without them, run the project from your coding assistant.');
  const executor = new AnthropicExecutor({ log: rt.log.child('executor') });
  const ac = new AbortController();
  process.once('SIGINT', () => {
    ctx.io.err('stopping after running tasks finish…');
    ac.abort();
  });
  const maxTasks = str(ctx.flags, 'max-tasks') ? Number(str(ctx.flags, 'max-tasks')) : undefined;
  const r = await runAutonomous(rt, executor, {
    signal: ac.signal,
    ...(maxTasks ? { maxTasks } : {}),
    onEvent: (e) => ctx.io.out(`[${e.type}] ${e.task.agent}: ${e.task.title}`),
  });
  ctx.io.out(`\nexecuted ${r.executed} task(s); stopped: ${r.stoppedBecause}`);
  await status(rt, ctx.io);
}

export const COMMANDS: Record<string, { summary: string; usage: string; run: (ctx: Ctx) => Promise<void> }> = {
  init: {
    summary: 'Create a new project workspace in the current folder',
    usage: 'init "<name>" [--brief <text> | --brief-file <path>] [--lang en,ar] [--industry x] [--market x] [--figma <url>] [--concept-selection auto|user] [--breakpoints desktop,mobile] [--themes light,dark]',
    async run(ctx) {
      const name = ctx.args[0] ?? (await ctx.io.ask('Project name: '));
      if (!name) throw new CliError('a project name is required');
      const brief = str(ctx.flags, 'brief-file') ? readFileSync(str(ctx.flags, 'brief-file')!, 'utf8') : str(ctx.flags, 'brief') ?? (await ctx.io.ask('Short brief (what are we designing?): ')) ?? '';
      const rt = await runtime(ctx, { needProject: false });
      try {
        if (rt.hasProject) throw new CliError(`a project already exists here (${rt.requireProject().ws.projectId}). Use \`status\`/\`resume\`, or \`delete\` it first.`);
        const languages = (list(ctx.flags, 'lang') ?? ['en']) as Array<'en' | 'ar'>;
        const p = await rt.initProject({
          name, brief, languages,
          ...(str(ctx.flags, 'industry') ? { industry: str(ctx.flags, 'industry')! } : {}),
          ...(str(ctx.flags, 'market') ? { market: str(ctx.flags, 'market')! } : {}),
          ...(str(ctx.flags, 'figma') ? { figmaFileUrl: str(ctx.flags, 'figma')! } : {}),
          settings: {
            ...(str(ctx.flags, 'concept-selection') ? { conceptSelection: str(ctx.flags, 'concept-selection') as 'auto' | 'user' } : {}),
            ...(list(ctx.flags, 'breakpoints') ? { breakpoints: list(ctx.flags, 'breakpoints') as Array<'desktop' | 'tablet' | 'mobile'> } : {}),
            ...(list(ctx.flags, 'themes') ? { themes: list(ctx.flags, 'themes') as Array<'light' | 'dark'> } : {}),
          },
        });
        ctx.io.out(`Created project ${p.ws.getProject().name} (${p.ws.projectId})`);
        ctx.io.out(`Workspace: ${p.ws.dir}`);
        ctx.io.out('Add logos to assets/logos and images to assets/images, then run `ui-ux-magec start`.');
      } finally {
        await rt.close();
      }
    },
  },
  start: {
    summary: 'Plan the full new-project workflow (and optionally run it autonomously)',
    usage: 'start [--autonomous] [--max-tasks n]',
    async run(ctx) {
      const rt = await runtime(ctx);
      try {
        const created = await rt.requireProject().orchestrator.planNewProject();
        ctx.io.out(created.length ? `Planned ${created.length} initial task(s).` : 'Workflow already planned.');
        await status(rt, ctx.io);
        await maybeRun(rt, ctx);
      } finally {
        await rt.close();
      }
    },
  },
  design: {
    summary: 'Continue design work on an existing project (plans the pipeline if needed)',
    usage: 'design [--autonomous] [--max-tasks n]',
    async run(ctx) {
      const rt = await runtime(ctx);
      try {
        const p = rt.requireProject();
        if ((await p.tasks.list()).length === 0) await p.orchestrator.planNewProject();
        await status(rt, ctx.io);
        await maybeRun(rt, ctx);
      } finally {
        await rt.close();
      }
    },
  },
  resume: {
    summary: 'Validate the workspace, recover interrupted tasks and show where work continues',
    usage: 'resume [--autonomous] [--reconcile]',
    async run(ctx) {
      const rt = await runtime(ctx);
      try {
        const p = rt.requireProject();
        const r = await p.orchestrator.resume();
        if (!r.validation.ok) {
          ctx.io.out('Workspace has errors that need attention:');
          r.validation.errors.forEach((e) => ctx.io.out(`  ✗ ${e}`));
        }
        r.validation.warnings.forEach((w) => ctx.io.out(`  ! ${w}`));
        r.repairs.forEach((a) => ctx.io.out(`  repaired: ${a}`));
        if (r.recoveredTasks.length) ctx.io.out(`  recovered ${r.recoveredTasks.length} interrupted task(s): ${r.recoveredTasks.join(', ')}`);
        ctx.io.out(`  last valid checkpoint: ${r.lastCheckpoint ?? 'none'}`);
        if (ctx.flags.reconcile && r.figmaLinked) {
          const st = await rt.transport.status();
          if (!st.connected) ctx.io.out('  Figma plugin not connected; skipped reconciliation (it runs before the next Figma write).');
          else {
            const rec = await p.figma.reconcile();
            ctx.io.out(`  Figma reconcile: ${rec.ok.length} ok · ${rec.missing.length} missing · ${rec.changedExternally.length} edited in Figma · ${rec.recoveredOperations.length} interrupted write(s) settled`);
          }
        }
        ctx.io.out('');
        await status(rt, ctx.io);
        await maybeRun(rt, ctx);
      } finally {
        await rt.close();
      }
    },
  },
  status: {
    summary: 'Show project status',
    usage: 'status [--json]',
    async run(ctx) {
      const rt = await runtime(ctx, { needProject: false });
      try {
        if (ctx.flags.json) {
          const r = await rt.tools.invoke('magec_project_status', {}, { agentId: 'master-orchestrator' });
          ctx.io.out(JSON.stringify(r.ok ? r.result : r.error, null, 2));
        } else await status(rt, ctx.io);
      } finally {
        await rt.close();
      }
    },
  },
  research: {
    summary: 'Plan scoped research, e.g. research "creative hero sections"',
    usage: 'research "<request>" [--category <slug>] [--autonomous]',
    async run(ctx) {
      const request = ctx.args.join(' ');
      if (!request) throw new CliError('describe what to research');
      const rt = await runtime(ctx);
      try {
        const t = await rt.requireProject().orchestrator.planResearch(request, str(ctx.flags, 'category'));
        printTasks(ctx.io, t);
        await maybeRun(rt, ctx);
      } finally {
        await rt.close();
      }
    },
  },
  audit: {
    summary: 'Audit an existing Figma design (modes: audit, suggest, extend)',
    usage: 'audit [--mode audit|suggest|extend] [--figma <url>] ["<what to focus on>"] [--autonomous]',
    async run(ctx) {
      const mode = (str(ctx.flags, 'mode') ?? 'audit') as 'audit' | 'suggest' | 'extend';
      if (!['audit', 'suggest', 'extend'].includes(mode)) throw new CliError('mode must be audit, suggest or extend');
      const rt = await runtime(ctx);
      try {
        const p = rt.requireProject();
        const url = str(ctx.flags, 'figma');
        if (url) {
          const { parseFigmaUrl } = await import('@ui-ux-magec/workspace');
          const parsed = parseFigmaUrl(url);
          if (!parsed) throw new CliError('not a Figma file URL');
          const cur = p.ws.getProject().figma.fileKey;
          if (cur && cur !== parsed.fileKey) throw new CliError(`this project is linked to Figma file ${cur}; create a separate project for another file`);
          await p.ws.updateProject((pr) => {
            pr.figma.fileKey = parsed.fileKey;
            pr.figma.fileUrl = url;
          });
        }
        printTasks(ctx.io, await p.orchestrator.planAudit(mode, ctx.args.join(' ')));
        await maybeRun(rt, ctx);
      } finally {
        await rt.close();
      }
    },
  },
  review: {
    summary: 'Run design QA on designed pages',
    usage: 'review [--pages home,search] [--autonomous]',
    async run(ctx) {
      const rt = await runtime(ctx);
      try {
        const t = await rt.requireProject().orchestrator.planReview(list(ctx.flags, 'pages'));
        if (!t.length) ctx.io.out('No designed pages found to review yet.');
        printTasks(ctx.io, t);
        await maybeRun(rt, ctx);
      } finally {
        await rt.close();
      }
    },
  },
  feedback: {
    summary: 'Give feedback in English or Arabic; it becomes scoped tasks',
    usage: 'feedback "<text>" [--global]',
    async run(ctx) {
      const text = ctx.args.join(' ');
      if (!text) throw new CliError('feedback text is required');
      const rt = await runtime(ctx);
      try {
        const r = await rt.tools.invoke('magec_feedback_submit', { text, persistence: ctx.flags.global ? 'global' : 'project' }, { agentId: 'master-orchestrator' });
        if (!r.ok) throw new CliError(r.error.message);
        const o = r.result as any;
        ctx.io.out(`Understood as: ${o.interpretation.intent} · scope ${o.interpretation.scope.level}${o.interpretation.scope.sections.length ? ` (${o.interpretation.scope.sections.join(', ')})` : ''}${o.interpretation.scope.pages.length ? ` on ${o.interpretation.scope.pages.join(', ')}` : ''}`);
        if (o.clarification) ctx.io.out(`Question: ${o.clarification}`);
        if (o.superseded.length) ctx.io.out(`Superseded ${o.superseded.length} outdated task(s).`);
        printTasks(ctx.io, o.created);
      } finally {
        await rt.close();
      }
    },
  },
  approve: {
    summary: 'Answer an approval request',
    usage: 'approve <taskId> [--choice <concept/option>] [--reject] [--note <text>]',
    async run(ctx) {
      const id = ctx.args[0];
      const rt = await runtime(ctx);
      try {
        const p = rt.requireProject();
        if (!id) {
          const waiting = await p.tasks.list({ status: ['waiting_for_approval'] });
          if (!waiting.length) return ctx.io.out('Nothing is waiting for approval.');
          for (const t of waiting) ctx.io.out(`  ${t.taskId}  ${t.title}\n      ${t.description ?? ''}`);
          return;
        }
        const t = await p.orchestrator.approve(id, { approved: !ctx.flags.reject, ...(str(ctx.flags, 'choice') ? { choice: str(ctx.flags, 'choice')! } : {}), note: str(ctx.flags, 'note') ?? 'via CLI' });
        ctx.io.out(`${t.taskId} → ${t.status}`);
      } finally {
        await rt.close();
      }
    },
  },
  retry: {
    summary: 'Retry a failed task (same inputs; not a redesign)',
    usage: 'retry <taskId>',
    async run(ctx) {
      if (!ctx.args[0]) throw new CliError('taskId required');
      const rt = await runtime(ctx);
      try {
        const t = await rt.requireProject().orchestrator.retry(ctx.args[0]);
        ctx.io.out(`${t.taskId} → ${t.status}`);
      } finally {
        await rt.close();
      }
    },
  },
  reset: {
    summary: 'Restart the design process in this project (keeps brief, assets, memory; archives generated work)',
    usage: 'reset [--reason <text>] [--yes]',
    async run(ctx) {
      const rt = await runtime(ctx);
      try {
        const p = rt.requireProject();
        ctx.io.out('Reset archives generated artifacts inside .ui-ux-magec/archive, supersedes all tasks and clears stages.');
        ctx.io.out('It keeps the project id, brief, assets, decisions and feedback. Figma content is NOT deleted.');
        if (!(await confirm(ctx.io, `Reset "${p.ws.getProject().name}"?`, { yes: Boolean(ctx.flags.yes) }))) throw new CliError('cancelled');
        const r = await p.orchestrator.reset(str(ctx.flags, 'reason') ?? 'user requested reset');
        ctx.io.out(`Archived ${r.archived.length} artifact(s); superseded ${r.superseded} task(s). Run \`ui-ux-magec start\` to plan again.`);
      } finally {
        await rt.close();
      }
    },
  },
  delete: {
    summary: 'Permanently delete this project workspace (no hidden copy is kept)',
    usage: 'delete [--include-assets] [--confirm-name "<project name>"]',
    async run(ctx) {
      const root = findWorkspaceRoot(ctx.dir);
      if (!root || root !== ctx.dir) throw new CliError(`no ui-ux-magec project in ${ctx.dir}`);
      const ws = await Workspace.open(root);
      const name = ws.getProject().name;
      ctx.io.out(`This permanently deletes ${ws.dir}${ctx.flags['include-assets'] ? ' and assets/' : ''}.`);
      ctx.io.out('Nothing is kept elsewhere; the project cannot be restored by ui-ux-magec. Figma content is not touched.');
      const typed = str(ctx.flags, 'confirm-name') ?? (await ctx.io.ask(`Type the project name ("${name}") to confirm: `));
      if (typed !== name) throw new CliError('name did not match; nothing was deleted');
      await ws.destroy({ includeAssets: Boolean(ctx.flags['include-assets']) });
      ctx.io.out('Deleted.');
    },
  },
  tasks: {
    summary: 'List tasks',
    usage: 'tasks [--status ready,failed] [--agent id]',
    async run(ctx) {
      const rt = await runtime(ctx);
      try {
        const t = await rt.requireProject().tasks.list({ ...(list(ctx.flags, 'status') ? { status: list(ctx.flags, 'status') as any } : {}), ...(str(ctx.flags, 'agent') ? { agent: str(ctx.flags, 'agent')! } : {}) });
        printTasks(ctx.io, t);
      } finally {
        await rt.close();
      }
    },
  },
  agents: {
    summary: 'List agents and their permissions',
    usage: 'agents',
    async run(ctx) {
      const rt = await runtime(ctx, { needProject: false });
      try {
        for (const a of rt.agents.list()) {
          const d = a.definition;
          ctx.io.out(`${d.id} (${d.kind})\n  ${d.description}\n  tasks: ${d.taskTypes.join(', ')}\n  permissions: ${d.permissions.join(', ')}\n  skills: ${d.skills.shared.length} shared, ${d.skills.specialized.length} specialized`);
        }
      } finally {
        await rt.close();
      }
    },
  },
  skills: {
    summary: 'List skills, or validate the registry',
    usage: 'skills [--agent id] [--validate]',
    async run(ctx) {
      const rt = await runtime(ctx, { needProject: false });
      try {
        if (ctx.flags.validate) {
          const issues = rt.skills.validate(new Set(rt.tools.list().map((t) => t.name)), new Set(rt.agents.ids()));
          const errors = issues.filter((i) => i.level === 'error');
          issues.forEach((i) => ctx.io.out(`${i.level === 'error' ? '✗' : '!'} ${i.skill}: ${i.message}`));
          ctx.io.out(`${rt.skills.list().length} skills, ${errors.length} error(s), ${issues.length - errors.length} warning(s)`);
          if (errors.length) throw new CliError('skill registry has errors');
          return;
        }
        for (const s of rt.skills.list({ ...(str(ctx.flags, 'agent') ? { agent: str(ctx.flags, 'agent')! } : {}) })) ctx.io.out(`${s.category === 'shared' ? 'S' : 's'} ${s.name.padEnd(30)} ${s.description}`);
      } finally {
        await rt.close();
      }
    },
  },
  bridge: {
    summary: 'Figma bridge: serve | status | rotate (new token + rebuild plugin)',
    usage: 'bridge serve|status|rotate',
    async run(ctx) {
      const sub = ctx.args[0] ?? 'status';
      const { config, created } = await ensureConfig();
      if (created) ctx.io.out(`Created ${configPath()}.`);
      const fp = createHash('sha256').update(config.bridge.token).digest('hex').slice(0, 8);
      if (sub === 'rotate') {
        const { randomBytes } = await import('node:crypto');
        await updateConfig((c) => {
          c.bridge.token = randomBytes(32).toString('hex');
        });
        // The token is baked into the plugin build, so rebuild it; the user only has to reopen the plugin.
        execFileSync(process.execPath, [new URL('../../figma-plugin/scripts/build.mjs', import.meta.url).pathname], { stdio: 'inherit' });
        ctx.io.out('Token rotated and plugin rebuilt. Close and reopen the ui-ux-magec plugin in Figma.');
        return;
      }
      const conn = new BridgeConnection({ ...bridgeSettings()!, hostOnly: sub === 'serve' });
      if (sub === 'serve') {
        await conn.start();
        ctx.io.out(`Bridge listening on 127.0.0.1:${config.bridge.port} (token fingerprint ${fp}). Waiting for the Figma plugin… Ctrl+C to stop.`);
        let last = '';
        const timer = setInterval(async () => {
          const s = await conn.status();
          const line = s.plugin ? `plugin connected: ${s.plugin.fileName} (${s.plugin.editorType}, v${s.plugin.version})` : 'plugin not connected';
          if (line !== last) ctx.io.out(line);
          last = line;
        }, 1000);
        await new Promise<void>((resolve) => process.once('SIGINT', () => resolve()));
        clearInterval(timer);
        await conn.close();
        return;
      }
      const s = await conn.status();
      ctx.io.out(`port ${config.bridge.port} · role ${s.role} · ${s.connected ? `plugin connected to "${s.plugin?.fileName}"` : `plugin not connected${s.detail ? ` (${s.detail})` : ''}`} · token fingerprint ${fp}`);
      await conn.close();
    },
  },
  mcp: {
    summary: 'Run the MCP server on stdio (used by coding assistants)',
    usage: 'mcp',
    async run(ctx) {
      const rt = await MagecRuntime.create({ projectDir: ctx.dir, platform: process.env.MAGEC_PLATFORM ?? 'mcp-host' });
      await new McpServer(rt).serve();
      await rt.close();
    },
  },
  'install-integrations': {
    summary: 'Install the Claude Code / Codex / OpenCode integration for this project folder',
    usage: 'install-integrations [--platform claude,codex,opencode] [--dry-run] [--force] [--yes]',
    async run(ctx) {
      const platforms = (list(ctx.flags, 'platform') ?? PLATFORMS) as Platform[];
      for (const p of platforms) if (!PLATFORMS.includes(p)) throw new CliError(`unknown platform ${p}`);
      const rt = await runtime(ctx, { needProject: false });
      try {
        await ensureConfig();
        for (const platform of platforms) {
          const planned = planIntegration(rt, platform, { force: Boolean(ctx.flags.force) });
          ctx.io.out(`\n${platform}:`);
          describePlanned(planned, ctx.dir).forEach((l) => ctx.io.out(`  ${l}`));
          const changes = planned.filter((p) => p.status === 'create' || p.status === 'update');
          if (ctx.flags['dry-run'] || !changes.length) continue;
          const outside = changes.filter((p) => !p.action.path.startsWith(ctx.dir));
          if (outside.length && !(await confirm(ctx.io, `  Modify user-level config (${outside.map((p) => p.action.path).join(', ')})?`, { yes: Boolean(ctx.flags.yes) }))) {
            applyPlanned(changes.filter((p) => p.action.path.startsWith(ctx.dir)));
            ctx.io.out('  skipped user-level config; project files written');
            continue;
          }
          applyPlanned(changes);
          await updateConfig((c) => {
            c.integrations[platform] = { installedAt: new Date().toISOString(), target: ctx.dir };
          });
          ctx.io.out('  done');
        }
        if (platforms.some((p) => planIntegration(rt, p).some((x) => x.status === 'conflict'))) ctx.io.out('\nConflicts were left untouched. Re-run with --force to overwrite them.');
      } finally {
        await rt.close();
      }
    },
  },
  doctor: {
    summary: 'Check installation, configuration, Figma bridge and workspace health',
    usage: 'doctor',
    async run(ctx) {
      const ok = (m: string) => ctx.io.out(`  ✓ ${m}`);
      const warn = (m: string) => ctx.io.out(`  ! ${m}`);
      const bad = (m: string) => ctx.io.out(`  ✗ ${m}`);
      let failures = 0;
      ctx.io.out('Environment');
      const major = Number(process.versions.node.split('.')[0]);
      if (major >= 20) ok(`Node.js ${process.versions.node}`);
      else (bad(`Node.js ${process.versions.node} (need ≥ 20)`), failures++);
      let rt: MagecRuntime | null = null;
      try {
        rt = await MagecRuntime.create({ projectDir: ctx.dir, platform: 'cli', logLevel: 'error' });
        ok(`runtime built (${rt.root})`);
      } catch (err) {
        bad(`runtime failed to start: ${(err as Error).message}`);
        failures++;
      }
      if (rt) {
        ctx.io.out('Agents & skills');
        const agentErrors = rt.agents.issues.filter((i) => i.level === 'error');
        if (agentErrors.length) (agentErrors.forEach((i) => bad(`${i.agent}: ${i.message}`)), failures++);
        else ok(`${rt.agents.list().length} agents`);
        const skillIssues = rt.skills.validate(new Set(rt.tools.list().map((t) => t.name)), new Set(rt.agents.ids()));
        const se = skillIssues.filter((i) => i.level === 'error');
        if (se.length) (se.slice(0, 10).forEach((i) => bad(`${i.skill}: ${i.message}`)), failures++);
        else ok(`${rt.skills.list().length} skills (${skillIssues.length} warning(s))`);
        ok(`${rt.tools.list().length} runtime tools`);
      }
      ctx.io.out('Configuration');
      const cfg = existsSync(configPath()) ? bridgeSettings() : null;
      if (cfg) ok(`${configPath()} (bridge port ${cfg.port})`);
      else warn(`no ${configPath()} yet — run setup (or \`npm run build\`)`);
      if (hasAnthropicCredentials()) ok('Claude API credentials found (autonomous mode available)');
      else warn('no ANTHROPIC_API_KEY — autonomous mode unavailable (host-driven mode works)');
      if (process.env.BRAVE_SEARCH_API_KEY) ok('BRAVE_SEARCH_API_KEY set (runtime web search)');
      else warn('no BRAVE_SEARCH_API_KEY — research uses the host assistant\'s web search');
      const stock = ['UNSPLASH_ACCESS_KEY', 'PEXELS_API_KEY'].filter((k) => process.env[k]);
      if (stock.length) ok(`${stock.join(', ')} set (stock photo search)`);
      else warn('no UNSPLASH_ACCESS_KEY / PEXELS_API_KEY — stock photos are found with the host assistant\'s web search');
      if (process.env.FIGMA_TOKEN) ok('FIGMA_TOKEN set (read-only REST fallback)');
      ctx.io.out('Figma bridge');
      if (rt) {
        const s = await rt.transport.status();
        if (s.connected) ok(`plugin connected: "${s.plugin?.fileName}" (${s.plugin?.editorType}, plugin v${s.plugin?.version})`);
        else warn(`plugin not connected${s.detail ? `: ${s.detail}` : ''}. Open Figma Desktop → Plugins → Development → ui-ux-magec bridge.`);
      }
      const manifest = rt ? `${rt.root}/apps/figma-plugin/manifest.json` : '';
      if (manifest && existsSync(manifest)) ok(`plugin manifest: ${manifest}`);
      else (bad('plugin not built (npm run build)'), failures++);
      ctx.io.out('Workspace');
      if (rt?.hasProject) {
        const v = await rt.requireProject().ws.validate();
        v.errors.forEach((e) => bad(e));
        v.warnings.forEach((w) => warn(w));
        if (v.ok) ok(`project ${rt.requireProject().ws.projectId} is valid`);
        else failures++;
      } else ctx.io.out(`  - no project in ${ctx.dir}`);
      ctx.io.out(`  global data dir: ${globalHome()} (config + explicit preferences only)`);
      await rt?.close();
      if (failures) throw new CliError(`${failures} problem(s) found`);
    },
  },
};

export { DEFAULT_BRIDGE_PORT };
