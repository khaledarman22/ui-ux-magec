// Agent task handoff through the runtime tools. Figma and the network are MOCKED.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MagecRuntime } from '@ui-ux-magec/runtime';
import { sandbox } from '../helpers/env.js';
import { FakePluginTransport } from '../helpers/fake-transport.js';
import { mockWeb } from '../helpers/scripted-agents.js';

let env: ReturnType<typeof sandbox>;
let rt: MagecRuntime;
const as = (agentId: string) => (name: string, input: Record<string, unknown> = {}) => rt.tools.invoke(name, input, { agentId });

beforeEach(async () => {
  env = sandbox();
  rt = await MagecRuntime.create({ projectDir: env.dir, transport: new FakePluginTransport(), fetch: mockWeb, stderr: false, researchHostIntervalMs: 0 });
  await rt.initProject({ name: 'Handoff', brief: 'Agency site' });
});
afterEach(async () => {
  await rt.close();
  env.cleanup();
});

describe('agent task handoff', () => {
  it('orchestrator plans, specialist claims and completes, and the graph expands', async () => {
    const orch = as('master-orchestrator');
    await orch('magec_plan_workflow', { kind: 'new-project' });
    const next = (await orch('magec_task_next')) as any;
    expect(next.ok).toBe(true);
    const task = next.result.tasks[0];
    expect(task.agent).toBe('product-analyst');
    // Another specialist cannot take it.
    const steal = await as('research-agent')('magec_task_start', { taskId: task.taskId });
    expect(steal.ok).toBe(false);
    const pa = as('product-analyst');
    const started = (await pa('magec_task_start', { taskId: task.taskId })) as any;
    expect(started.result.outputContract.schema).toBe('ProductAnalysis');
    // Invalid output is rejected with field-level errors and the task stays running.
    const bad = (await pa('magec_task_complete', { taskId: task.taskId, output: { productType: 'x' } })) as any;
    expect(bad.result.accepted).toBe(false);
    expect(bad.result.errors.join(' ')).toMatch(/features|sitemap/);
    const good = (await pa('magec_task_complete', {
      taskId: task.taskId,
      output: { productType: 'site', industry: 'agency', summary: 's', audiences: [{ name: 'a', needs: ['n'] }], features: [{ id: 'hero', name: 'Hero', description: 'd', priority: 'must', justification: 'first impression matters most' }], sitemap: [{ slug: 'home', name: 'Home', purpose: 'p' }], languages: ['en'], direction: 'ltr' },
    })) as any;
    expect(good.result.accepted).toBe(true);
    const p = rt.requireProject();
    expect(await p.ws.readArtifactJson('planning/product-analysis.json')).toMatchObject({ industry: 'agency' });
    const ready = (await p.tasks.ready()).map((t) => t.type).sort();
    expect(ready).toEqual(['brand-analysis', 'research-plan']);
    expect((await p.ws.getState()).completedStages).toContain('requirements-completed');
  });

  it('rejects completion claims about Figma work that never happened', async () => {
    const p = rt.requireProject();
    const [t] = await p.tasks.create([{ idempotencyKey: 'x', agent: 'figma-designer', type: 'figma-page-design', title: 'Home', params: { page: 'home' } }]);
    const fd = as('figma-designer');
    await fd('magec_task_start', { taskId: t!.taskId });
    const r = (await fd('magec_task_complete', { taskId: t!.taskId, output: { operationIds: ['op_fake'], nodes: [{ logicalId: 'screen/home', nodeId: '1:1', action: 'created' }] } })) as any;
    expect(r.result.accepted).toBe(false);
    expect(r.result.errors.join(' ')).toMatch(/not in the Figma operation journal|never written/);
    expect((await p.tasks.get(t!.taskId)).status).toBe('running');
  });

  it('rejects research reports citing references that were never retrieved', async () => {
    const p = rt.requireProject();
    const [t] = await p.tasks.create([{ idempotencyKey: 'r', agent: 'research-agent', type: 'research', title: 'Hero', params: { category: 'hero-section' } }]);
    const ra = as('research-agent');
    await ra('magec_task_start', { taskId: t!.taskId });
    const r = (await ra('magec_task_complete', { taskId: t!.taskId, output: { category: 'hero-section', summary: 's', referenceIds: ['ref_invented'], sourcesTried: [{ source: 'dribbble', status: 'ok' }] } })) as any;
    expect(r.result.accepted).toBe(false);
  });

  it('Figma writes require a running task owned by the caller', async () => {
    const p = rt.requireProject();
    const [t] = await p.tasks.create([{ idempotencyKey: 'f', agent: 'figma-designer', type: 'figma-page-design', title: 'Home', params: {} }]);
    const r = await as('figma-designer')('magec_figma_apply_spec', { taskId: t!.taskId, spec: { specVersion: 1, screens: [] } });
    expect(!r.ok && r.error.message).toMatch(/running task/);
  });

  it('structured messages are delivered to the target agent context', async () => {
    await as('creative-director')('magec_message_send', { to: 'figma-designer', kind: 'handoff', body: 'Use the Kinetic Editorial concept; keep CTA above the fold.' });
    const p = rt.requireProject();
    const [t] = await p.tasks.create([{ idempotencyKey: 'm', agent: 'figma-designer', type: 'figma-page-design', title: 'Home', params: {} }]);
    const ctx = await p.orchestrator.contextPack(await p.tasks.get(t!.taskId));
    expect(ctx).toMatch(/Kinetic Editorial/);
  });
});
