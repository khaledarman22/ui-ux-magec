// One-time scaffolding helper: writes package.json/tsconfig.json for each workspace package
// from the dependency graph below. Re-running only rewrites these two generated files.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const pkgs = {
  'packages/schemas': { deps: [], ext: { zod: '^4.1.0' }, desc: 'Zod schemas and shared types (contracts between agents, tasks, workspace, Figma ops).' },
  'packages/logger': { deps: [], desc: 'Structured JSONL logger with secret redaction.' },
  'packages/workspace': { deps: ['schemas', 'logger'], desc: 'Deterministic local project workspace service (atomic files, locks, checkpoints).' },
  'packages/cache': { deps: ['schemas', 'workspace'], desc: 'Project-local cache with TTL, content hashes and dependency invalidation.' },
  'packages/memory': { deps: ['schemas', 'workspace'], desc: 'Project memory (decisions, assumptions, feedback) and opt-in global knowledge.' },
  'packages/task-manager': { deps: ['schemas', 'workspace', 'logger'], desc: 'Persistent task store, state machine, dependency scheduler and scope locks.' },
  'packages/skill-registry': { deps: ['schemas'], ext: { yaml: '^2.8.0' }, desc: 'Skill discovery, shared/specialized resolution and on-demand loading.' },
  'packages/agent-core': { deps: ['schemas', 'skill-registry', 'logger'], ext: { '@anthropic-ai/sdk': '^1.3.0' }, desc: 'Agent registry, permissions, tool registry and agent executors.' },
  'packages/research': { deps: ['schemas', 'cache', 'logger'], desc: 'Research sources, robots-aware fetcher, search providers and verification.' },
  'packages/reference-intelligence': { deps: ['schemas', 'workspace'], desc: 'Reference store, canonicalization, dedup, ranking with diversity.' },
  'packages/design-engine': { deps: ['schemas'], desc: 'Design tokens, color/contrast math, design spec compilation to Figma node trees.' },
  'packages/figma-bridge': { deps: ['schemas', 'workspace', 'logger'], ext: { ws: '^8.18.0' }, desc: 'Local authenticated bridge to the Figma plugin plus write coordinator.' },
  'packages/quality-assurance': { deps: ['schemas', 'design-engine'], desc: 'Structural design QA checks and QA loop.' },
  'packages/orchestration': { deps: ['schemas', 'workspace', 'memory', 'task-manager', 'agent-core', 'logger'], desc: 'Master orchestration: workflows, expansion, feedback routing, autonomous loop.' },
  'integrations': { deps: ['schemas', 'agent-core', 'skill-registry'], name: 'integrations', desc: 'Platform adapters: Claude Code, OpenAI Codex, OpenCode.' },
  'apps/runtime': { deps: ['schemas', 'logger', 'workspace', 'cache', 'memory', 'task-manager', 'skill-registry', 'agent-core', 'research', 'reference-intelligence', 'design-engine', 'figma-bridge', 'quality-assurance', 'orchestration'], desc: 'Runtime composition root, tool catalog and MCP server.' },
  'apps/cli': { deps: ['schemas', 'logger', 'workspace', 'runtime', 'integrations', 'task-manager', 'figma-bridge'], desc: 'ui-ux-magec command line interface.' },
};

for (const [dir, cfg] of Object.entries(pkgs)) {
  const abs = join(root, dir);
  mkdirSync(join(abs, 'src'), { recursive: true });
  const short = cfg.name ?? dir.split('/')[1];
  const name = `@ui-ux-magec/${short}`;
  const dependencies = {};
  for (const d of cfg.deps) dependencies[`@ui-ux-magec/${d}`] = '0.1.0';
  Object.assign(dependencies, cfg.ext ?? {});
  const pkgPath = join(abs, 'package.json');
  const existing = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
  const pkg = {
    name, version: '0.1.0', private: true, description: cfg.desc, type: 'module',
    main: './dist/index.js', types: './dist/index.d.ts',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' }, ...(existing.extraExports ?? {}) },
    ...(existing.bin ? { bin: existing.bin } : {}),
    ...(existing.extraExports ? { extraExports: existing.extraExports } : {}),
    dependencies,
  };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const refs = cfg.deps.map((d) => {
    const target = Object.keys(pkgs).find((k) => (pkgs[k].name ?? k.split('/')[1]) === d);
    return { path: relative(abs, join(root, target)) };
  });
  const tsconfig = {
    extends: relative(abs, join(root, 'tsconfig.base.json')),
    compilerOptions: { rootDir: 'src', outDir: 'dist' },
    include: ['src/**/*.ts'],
    references: refs,
  };
  writeFileSync(join(abs, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
}
const build = { files: [], references: Object.keys(pkgs).map((p) => ({ path: p })) };
writeFileSync(join(root, 'tsconfig.build.json'), JSON.stringify(build, null, 2) + '\n');
console.log(`scaffolded ${Object.keys(pkgs).length} packages`);
