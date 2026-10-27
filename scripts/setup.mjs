#!/usr/bin/env node
// ui-ux-magec setup. Idempotent: safe to run again at any time. Never prints secrets, never overwrites user
// configuration without asking. Flags: --yes (accept all), --non-interactive (decline anything that needs
// consent), --dry-run (show what would happen), --skip-build.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const argv = new Set(process.argv.slice(2));
const YES = argv.has('--yes');
const NON_INTERACTIVE = argv.has('--non-interactive') || !process.stdin.isTTY;
const DRY = argv.has('--dry-run');
const SKIP_BUILD = argv.has('--skip-build');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

const step = (m) => console.log(`\n▸ ${m}`);
const ok = (m) => console.log(`  ✓ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const warn = (m) => console.log(`  ! ${m}`);

async function ask(question) {
  if (YES) return true;
  if (NON_INTERACTIVE) {
    info(`${question} → skipped (non-interactive; re-run with --yes to accept)`);
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^(y|yes)$/i.test((await rl.question(`  ? ${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

function run(cmd, args, opts = {}) {
  if (DRY) return info(`would run: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status})`);
}

function which(bin) {
  const r = spawnSync(isWin ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

function newer(a, b) {
  return existsSync(a) && (!existsSync(b) || statSync(a).mtimeMs > statSync(b).mtimeMs);
}

async function main() {
  console.log('ui-ux-magec setup' + (DRY ? ' (dry run)' : ''));

  step('Checking Node.js');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw new Error(`Node.js ${process.versions.node} found; ui-ux-magec needs Node.js 20 or newer (22 recommended).`);
  ok(`Node.js ${process.versions.node}`);

  step('Installing dependencies');
  if (!existsSync(join(root, 'node_modules')) || newer(join(root, 'package.json'), join(root, 'node_modules', '.package-lock.json'))) {
    run(npm, ['install', '--no-fund', '--no-audit']);
    ok('dependencies installed');
  } else ok('dependencies up to date');

  step('Building');
  if (SKIP_BUILD) info('skipped (--skip-build)');
  else {
    run(npm, ['run', 'build', '--silent']);
    ok('packages and Figma plugin built');
  }

  if (DRY && !existsSync(join(root, 'apps/runtime/dist/index.js'))) {
    info('dry run: build output missing, stopping before configuration steps');
    return;
  }
  const { ensureConfig, configPath } = await import(join(root, 'packages/figma-bridge/dist/index.js'));
  const { MagecRuntime } = await import(join(root, 'apps/runtime/dist/index.js'));
  const integ = await import(join(root, 'integrations/dist/index.js'));

  step('Local configuration');
  if (DRY) info(`would ensure ${configPath()} (bridge port + random pairing token, mode 0600)`);
  else {
    const { created } = await ensureConfig();
    ok(`${configPath()} ${created ? 'created with a new pairing token' : 'already present (token kept)'}`);
  }

  const mcpScript = join(root, 'apps/runtime/bin/mcp.js');
  const node = integ.stableNodePath();
  const rt = await MagecRuntime.create({ projectDir: homedir(), platform: 'setup', logLevel: 'error' });
  const base = {
    mcpCommand: { command: node, args: [mcpScript] },
    agents: rt.agents.list().map((a) => ({ definition: a.definition, instructions: a.instructions, allowedTools: rt.tools.allowedFor(a.definition.id).map((t) => t.name) })),
    skillIndex: (id) => rt.skills.indexFor(rt.agents.require(id).definition),
    scope: 'user',
  };
  const applyUser = async (label, actions) => {
    const planned = integ.planActions(actions);
    for (const line of integ.describePlanned(planned, homedir())) info(line);
    const changes = planned.filter((p) => p.status === 'create' || p.status === 'update');
    const conflicts = planned.filter((p) => p.status === 'conflict');
    if (conflicts.length) warn(`${conflicts.length} existing file(s) were not created by ui-ux-magec and were left untouched`);
    if (!changes.length) return ok(`${label}: nothing to change`);
    if (DRY) return info(`${label}: would write ${changes.length} file(s)`);
    if (await ask(`${label}: write ${changes.length} file(s) listed above?`)) {
      integ.applyPlanned(changes);
      ok(`${label}: installed`);
    }
  };

  step('Coding assistants');
  const claude = which('claude');
  const codex = which('codex');
  const opencode = which('opencode');
  if (!claude && !codex && !opencode) warn('no Claude Code, Codex or OpenCode CLI found on PATH; you can still use `ui-ux-magec` directly');

  if (claude) {
    ok(`Claude Code found (${claude})`);
    const existing = spawnSync(claude, ['mcp', 'get', 'ui-ux-magec'], { encoding: 'utf8', shell: isWin });
    if (existing.status === 0) ok('MCP server "ui-ux-magec" already registered with Claude Code');
    else if (DRY) info(`would run: claude mcp add ui-ux-magec --scope user -e MAGEC_PLATFORM=claude-code -- ${node} ${mcpScript}`);
    else if (await ask('Register the ui-ux-magec MCP server with Claude Code (user scope)?')) {
      // The name goes before `-e`: that option is variadic in the claude CLI and would swallow the name.
      run(claude, ['mcp', 'add', 'ui-ux-magec', '--scope', 'user', '-e', 'MAGEC_PLATFORM=claude-code', '--', node, mcpScript]);
      ok('registered');
    }
    await applyUser('Claude Code agents (~/.claude/agents, ~/.claude/skills/ui-ux-magec)', integ.claudeCodeActions({ ...base, projectDir: homedir() }));
  }
  if (codex) {
    ok(`Codex found (${codex})`);
    await applyUser('Codex (~/.codex/config.toml MCP server, ~/.codex/AGENTS.md)', integ.codexActions({ ...base, projectDir: homedir() }));
  }
  if (opencode) {
    ok(`OpenCode found (${opencode})`);
    const cfgHome = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'opencode') : join(homedir(), '.config', 'opencode');
    await applyUser('OpenCode (~/.config/opencode)', integ.openCodeActions({ ...base, projectDir: cfgHome }));
  }

  step('CLI command');
  const linked = which('ui-ux-magec');
  if (linked) ok(`ui-ux-magec is on PATH (${linked})`);
  else if (DRY) info('would run: npm link');
  else if (await ask('Make the `ui-ux-magec` command available globally (npm link)?')) {
    run(npm, ['link', '--silent']);
    ok('linked');
  } else info(`you can always run: node ${join(root, 'apps/cli/bin/ui-ux-magec.js')} <command>`);

  step('Figma plugin (one-time, manual)');
  info('Figma requires development plugins to be imported by hand:');
  info('  1. Open the Figma desktop app and a design file.');
  info('  2. Menu → Plugins → Development → Import plugin from manifest…');
  info(`  3. Choose ${join(root, 'apps/figma-plugin/manifest.json')}`);
  info('  4. Run "ui-ux-magec bridge" from Plugins → Development.');
  info('  It connects to ui-ux-magec automatically; nothing to type.');

  await rt.close();
  step('Health check');
  if (!DRY) spawnSync(process.execPath, [join(root, 'apps/cli/bin/ui-ux-magec.js'), 'doctor'], { stdio: 'inherit', cwd: homedir() });
  console.log('\nNext: in a new folder run `ui-ux-magec init "<project name>"`, then `ui-ux-magec install-integrations` there (optional, project-scoped) and open your coding assistant.');
}

main().catch((err) => {
  console.error(`\nsetup failed: ${err.message}`);
  process.exit(1);
});
