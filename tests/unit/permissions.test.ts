import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MagecRuntime, McpServer } from '@ui-ux-magec/runtime';
import { sandbox } from '../helpers/env.js';
import { FakePluginTransport } from '../helpers/fake-transport.js';

let env: ReturnType<typeof sandbox>;
let rt: MagecRuntime;
beforeAll(async () => {
  env = sandbox();
  rt = await MagecRuntime.create({ projectDir: env.dir, transport: new FakePluginTransport(), stderr: false });
  await rt.initProject({ name: 'Perms' });
});
afterAll(async () => {
  await rt.close();
  env.cleanup();
});

describe('permission enforcement', () => {
  it('denies tools outside an agent\'s permissions even though skills are shared', async () => {
    const qa = await rt.tools.invoke('magec_figma_apply_spec', { taskId: 'x', spec: {} }, { agentId: 'design-qa-agent' });
    expect(qa.ok).toBe(false);
    expect(!qa.ok && qa.error.code).toBe('permission_denied');
    const research = await rt.tools.invoke('magec_figma_delete_nodes', { taskId: 'x', logicalIds: ['a'], approvalTaskId: 'y' }, { agentId: 'research-agent' });
    expect(!research.ok && research.error.code).toBe('permission_denied');
    const plan = await rt.tools.invoke('magec_plan_workflow', { kind: 'new-project' }, { agentId: 'figma-designer' });
    expect(!plan.ok && plan.error.code).toBe('permission_denied');
  });

  it('allows tools within the agent\'s permissions', async () => {
    const r = await rt.tools.invoke('magec_research_sources', {}, { agentId: 'research-agent' });
    expect(r.ok).toBe(true);
  });

  it('rejects unknown agents and invalid input', async () => {
    const r = await rt.tools.invoke('magec_project_status', {}, { agentId: 'intruder' });
    expect(r.ok).toBe(false);
    const bad = await rt.tools.invoke('magec_contrast_check', { pairs: 'nope' }, { agentId: 'design-qa-agent' });
    expect(!bad.ok && bad.error.code).toBe('invalid_input');
  });

  it('the allowed tool list per agent matches its permissions', () => {
    const qaTools = rt.tools.allowedFor('design-qa-agent').map((t) => t.name);
    expect(qaTools).toContain('magec_qa_run');
    expect(qaTools).not.toContain('magec_figma_apply_spec');
    expect(rt.tools.allowedFor('figma-designer').map((t) => t.name)).toContain('magec_figma_apply_spec');
  });

  it('enforces permissions for MCP calls made "as_agent"', async () => {
    const out: string[] = [];
    const server = new McpServer(rt, (l) => out.push(l));
    await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'magec_figma_apply_spec', arguments: { as_agent: 'ux-audit-agent', taskId: 't', spec: {} } } });
    const res = JSON.parse(out[0]!);
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/permission_denied/);
  });
});
