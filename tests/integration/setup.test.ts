import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureConfig, configPath } from '@ui-ux-magec/figma-bridge';
import { main, type IO } from '@ui-ux-magec/cli';
import { sandbox } from '../helpers/env.js';

let env: ReturnType<typeof sandbox>;
let prevCodex: string | undefined;
beforeEach(() => {
  env = sandbox();
  prevCodex = process.env.CODEX_HOME;
  process.env.CODEX_HOME = join(env.home, 'codex');
});
afterEach(() => {
  if (prevCodex === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = prevCodex;
  env.cleanup();
});

function io(): IO & { lines: string[] } {
  const lines: string[] = [];
  return { lines, out: (l = '') => lines.push(l), err: (l) => lines.push(l), interactive: false, ask: async () => null };
}
const cli = async (...args: string[]) => {
  const o = io();
  const code = await main([...args, '--dir', env.dir], o);
  return { code, out: o.lines.join('\n') };
};

describe('setup idempotency', () => {
  it('local config is created once with a private token, then left alone', async () => {
    const a = await ensureConfig();
    const b = await ensureConfig();
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.config.bridge.token).toBe(a.config.bridge.token);
    if (process.platform !== 'win32') expect(statSync(configPath()).mode & 0o777).toBe(0o600);
  });

  it('installing integrations twice changes nothing the second time and never prints the token', async () => {
    const first = await cli('install-integrations', '--yes');
    expect(first.code).toBe(0);
    expect(existsSync(join(env.dir, '.mcp.json'))).toBe(true);
    expect(existsSync(join(env.dir, '.claude/agents/magec-figma-designer.md'))).toBe(true);
    expect(existsSync(join(env.dir, '.opencode/agent/magec-figma-designer.md'))).toBe(true);
    expect(readFileSync(join(env.home, 'codex/config.toml'), 'utf8')).toMatch(/\[mcp_servers\."ui-ux-magec"\]/);
    const second = await cli('install-integrations', '--yes');
    expect(second.out).not.toMatch(/\b(create|update) /);
    expect(second.out).toMatch(/unchanged/);
    const token = JSON.parse(readFileSync(configPath(), 'utf8')).bridge.token as string;
    expect(first.out + second.out).not.toContain(token);
    // The Codex config block is present exactly once.
    expect(readFileSync(join(env.home, 'codex/config.toml'), 'utf8').match(/ui-ux-magec >>>/g)).toHaveLength(1);
  });

  it('restricts each generated Claude subagent to its permitted tools', async () => {
    await cli('install-integrations', '--yes', '--platform', 'claude');
    const qa = readFileSync(join(env.dir, '.claude/agents/magec-design-qa-agent.md'), 'utf8');
    const toolsLine = qa.split('\n').find((l) => l.startsWith('tools:'))!;
    expect(toolsLine).toContain('mcp__ui-ux-magec__magec_qa_run');
    expect(toolsLine).not.toContain('magec_figma_apply_spec');
    expect(toolsLine).not.toMatch(/\bWrite\b|\bBash\b/);
  });

  it('does not overwrite user configuration without --force', async () => {
    mkdirSync(join(env.dir, '.claude/agents'), { recursive: true });
    writeFileSync(join(env.dir, '.claude/agents/magec-figma-designer.md'), 'my own agent');
    writeFileSync(join(env.dir, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' }, 'ui-ux-magec': { command: 'custom' } } }));
    const r = await cli('install-integrations', '--yes', '--platform', 'claude');
    expect(r.out).toMatch(/conflict/);
    expect(readFileSync(join(env.dir, '.claude/agents/magec-figma-designer.md'), 'utf8')).toBe('my own agent');
    const mcp = JSON.parse(readFileSync(join(env.dir, '.mcp.json'), 'utf8'));
    expect(mcp.mcpServers['ui-ux-magec'].command).toBe('custom');
    expect(mcp.mcpServers.other.command).toBe('x');
  });

  it('setup script dry run is side-effect free', () => {
    const root = process.env.MAGEC_REPO_ROOT!;
    if (!existsSync(join(root, 'apps/runtime/dist/index.js'))) return; // requires a build
    const fakeHome = join(env.home, 'user');
    mkdirSync(fakeHome, { recursive: true });
    const r = spawnSync(process.execPath, [join(root, 'scripts/setup.mjs'), '--dry-run', '--non-interactive', '--skip-build'], {
      encoding: 'utf8', env: { PATH: dirname(process.execPath), HOME: fakeHome, MAGEC_HOME: join(fakeHome, '.ui-ux-magec') },
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/dry run/);
    expect(readdirSync(fakeHome)).toEqual([]);
  });
});

describe('CLI lifecycle', () => {
  it('init → status → feedback → reset → delete (with typed confirmation)', async () => {
    expect((await cli('init', 'Agency', '--brief', 'Premium agency site', '--lang', 'en,ar')).code).toBe(0);
    expect((await cli('init', 'Again')).code).toBe(1);
    expect((await cli('start')).out).toMatch(/Planned \d+ initial task/);
    expect((await cli('status')).out).toMatch(/Agency/);
    expect((await cli('reset', '--yes')).out).toMatch(/superseded/);
    const wrong = await cli('delete', '--confirm-name', 'nope');
    expect(wrong.code).toBe(1);
    expect(existsSync(join(env.dir, '.ui-ux-magec'))).toBe(true);
    expect((await cli('delete', '--confirm-name', 'Agency')).code).toBe(0);
    expect(existsSync(join(env.dir, '.ui-ux-magec'))).toBe(false);
    expect((await cli('status')).out).toMatch(/no workspace/);
  });
});
