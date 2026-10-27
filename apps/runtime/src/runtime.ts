import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CacheService } from '@ui-ux-magec/cache';
import { GlobalKnowledge, ProjectMemory } from '@ui-ux-magec/memory';
import { TaskStore } from '@ui-ux-magec/task-manager';
import { SkillRegistry } from '@ui-ux-magec/skill-registry';
import { AgentRegistry, ToolRegistry, type AgentExecutor } from '@ui-ux-magec/agent-core';
import { BraveSearchProvider, PexelsProvider, ReferenceVerifier, ResearchFetcher, UnsplashProvider, type FetchLike, type ImageSearchProvider, type SearchProvider } from '@ui-ux-magec/research';
import { ReferenceStore } from '@ui-ux-magec/reference-intelligence';
import { BridgeConnection, FigmaRestClient, FigmaWriteCoordinator, UnavailableTransport, type FigmaTransport } from '@ui-ux-magec/figma-bridge';
import { Orchestrator } from '@ui-ux-magec/orchestration';
import { Workspace, findWorkspaceRoot, globalHome, type InitOptions } from '@ui-ux-magec/workspace';
import { Logger, JsonlFileSink, StderrSink, type LogLevel } from '@ui-ux-magec/logger';
import { registerAllTools } from './tools/index.js';

/** Repository root (agents/, skills/), resolved from this file in both src/ and dist/. */
export function repoRoot(): string {
  if (process.env.MAGEC_REPO_ROOT) return resolve(process.env.MAGEC_REPO_ROOT);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'agents')) && existsSync(join(dir, 'skills'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('cannot locate the ui-ux-magec repository root (set MAGEC_REPO_ROOT)');
}

export interface RuntimeOptions {
  /** Directory of the design project (where .ui-ux-magec lives or will be created). */
  projectDir: string;
  transport?: FigmaTransport;
  fetch?: FetchLike;
  imageProviders?: ImageSearchProvider[];
  searchProvider?: SearchProvider;
  executor?: AgentExecutor;
  logLevel?: LogLevel;
  stderr?: boolean;
  /** Host platform label shown to agents (claude-code, codex, opencode, cli). */
  platform?: string;
  /** Minimum delay between research requests to the same host. */
  researchHostIntervalMs?: number;
}

export interface ProjectServices {
  ws: Workspace;
  tasks: TaskStore;
  memory: ProjectMemory;
  cache: CacheService;
  references: ReferenceStore;
  fetcher: ResearchFetcher;
  verifier: ReferenceVerifier;
  figma: FigmaWriteCoordinator;
  orchestrator: Orchestrator;
}

/**
 * Composition root. Global services (agents, skills, tools, bridge) exist without a project; project services
 * are attached once a workspace is opened or initialized in `projectDir`.
 */
export class MagecRuntime {
  readonly root: string;
  readonly skills: SkillRegistry;
  readonly agents: AgentRegistry;
  readonly tools: ToolRegistry;
  readonly transport: FigmaTransport;
  readonly rest: FigmaRestClient;
  readonly search: SearchProvider;
  /** Free-license stock image APIs (enabled by UNSPLASH_ACCESS_KEY / PEXELS_API_KEY). */
  readonly imageProviders: ImageSearchProvider[];
  readonly knowledge: GlobalKnowledge;
  log: Logger;
  private project: ProjectServices | null = null;

  private constructor(readonly opts: RuntimeOptions) {
    this.root = repoRoot();
    this.log = new Logger('magec', opts.stderr === false ? [] : [new StderrSink()], opts.logLevel);
    this.skills = SkillRegistry.discover([join(this.root, 'skills')]);
    this.agents = AgentRegistry.load(join(this.root, 'agents'), this.skills);
    this.tools = new ToolRegistry((id) => this.agents.permissionsOf(id), this.log.child('tools'));
    this.transport = opts.transport ?? BridgeConnection.fromConfig(this.log.child('bridge')) ?? new UnavailableTransport('Figma bridge is not configured: run setup (or `npm run build`), then open the Figma plugin');
    this.rest = new FigmaRestClient();
    this.search = opts.searchProvider ?? new BraveSearchProvider(undefined, opts.fetch);
    this.imageProviders = opts.imageProviders ?? [new UnsplashProvider(undefined, opts.fetch), new PexelsProvider(undefined, opts.fetch)];
    this.knowledge = new GlobalKnowledge(globalHome());
    registerAllTools(this);
  }

  static async create(opts: RuntimeOptions): Promise<MagecRuntime> {
    const rt = new MagecRuntime(opts);
    const root = findWorkspaceRoot(opts.projectDir);
    if (root && resolve(root) === resolve(opts.projectDir)) await rt.attach(await Workspace.open(root));
    return rt;
  }

  get projectDir(): string {
    return resolve(this.opts.projectDir);
  }

  get hasProject(): boolean {
    return this.project !== null;
  }

  /** Throws a clear error when a tool needs a project and none is open. */
  requireProject(): ProjectServices {
    if (!this.project) throw new Error(`no ui-ux-magec project in ${this.projectDir}. Initialize one with magec_project_init (or \`ui-ux-magec init\`).`);
    return this.project;
  }

  async initProject(init: InitOptions): Promise<ProjectServices> {
    const ws = await Workspace.init(this.projectDir, init);
    return this.attach(ws);
  }

  /** Re-opens the workspace from disk (e.g. after another process changed it, or it was deleted). */
  async reload(): Promise<ProjectServices | null> {
    this.project = null;
    const root = findWorkspaceRoot(this.projectDir);
    if (root && resolve(root) === this.projectDir) return this.attach(await Workspace.open(root));
    return null;
  }

  private async attach(ws: Workspace): Promise<ProjectServices> {
    this.log = this.log.withSink(new JsonlFileSink(ws.resolve('logs')));
    const cache = new CacheService(ws.resolve('cache'));
    const fetcher = new ResearchFetcher({ cache, log: this.log.child('research'), ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}), ...(this.opts.researchHostIntervalMs !== undefined ? { minHostIntervalMs: this.opts.researchHostIntervalMs } : {}) });
    const tasks = new TaskStore(ws, this.log.child('tasks'));
    const memory = new ProjectMemory(ws);
    this.project = {
      ws, tasks, memory, cache, fetcher,
      references: new ReferenceStore(ws),
      verifier: new ReferenceVerifier(fetcher),
      figma: new FigmaWriteCoordinator(ws, this.transport, { log: this.log.child('figma') }),
      orchestrator: new Orchestrator(ws, tasks, memory, { log: this.log.child('orchestrator') }),
    };
    return this.project;
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
