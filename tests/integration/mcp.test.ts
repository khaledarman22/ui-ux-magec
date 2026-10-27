// MCP stdio server protocol (JSON-RPC) — in-process, with a MOCK Figma transport.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MagecRuntime, McpServer } from '@ui-ux-magec/runtime';
import { sandbox } from '../helpers/env.js';
import { FakePluginTransport } from '../helpers/fake-transport.js';

let env: ReturnType<typeof sandbox>;
beforeEach(() => (env = sandbox()));
afterEach(() => env.cleanup());

describe('MCP server', () => {
  it('initializes, lists tools with schemas and calls them', async () => {
    const rt = await MagecRuntime.create({ projectDir: env.dir, transport: new FakePluginTransport(), stderr: false });
    const out: string[] = [];
    const server = new McpServer(rt, (l) => out.push(l));
    await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    expect(JSON.parse(out[0]!).result.serverInfo.name).toBe('ui-ux-magec');
    await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = JSON.parse(out[1]!).result.tools;
    expect(tools.length).toBeGreaterThan(40);
    const init = tools.find((t: any) => t.name === 'magec_project_init');
    expect(init.inputSchema.type).toBe('object');
    expect(init.inputSchema.properties.as_agent.enum).toContain('figma-designer');
    await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'magec_project_init', arguments: { name: 'From MCP' } } });
    expect(JSON.parse(out[2]!).result.isError).toBe(false);
    await server.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'magec_project_status', arguments: {} } });
    expect(JSON.parse(JSON.parse(out[3]!).result.content[0].text).project.name).toBe('From MCP');
    await server.handle({ jsonrpc: '2.0', id: 5, method: 'nope' });
    expect(JSON.parse(out[4]!).error.code).toBe(-32601);
    await rt.close();
  });

  it('the built stdio entry point speaks JSON-RPC and keeps stdout clean', async () => {
    const bin = join(process.env.MAGEC_REPO_ROOT!, 'apps/runtime/bin/mcp.js');
    if (!existsSync(join(process.env.MAGEC_REPO_ROOT!, 'apps/runtime/dist/index.js'))) return; // requires `npm run build`
    const child = spawn(process.execPath, [bin], { env: { ...process.env, MAGEC_PROJECT_DIR: env.dir, MAGEC_HOME: env.home }, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines: string[] = [];
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      const parts = buf.split('\n');
      buf = parts.pop()!;
      lines.push(...parts.filter(Boolean));
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    for (let i = 0; i < 100 && lines.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    child.stdin.end();
    await new Promise((r) => child.on('exit', r));
    expect(lines.length).toBe(2);
    for (const l of lines) expect(() => JSON.parse(l)).not.toThrow();
    expect(JSON.parse(lines[1]!).result.tools.length).toBeGreaterThan(40);
  });
});
