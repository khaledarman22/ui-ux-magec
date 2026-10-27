/**
 * Acceptance scenarios A, D, E, F, H (section 27) run end-to-end through the real orchestrator, runtime tools,
 * task graph, workspace, design engine, Figma coordinator and plugin executor.
 * MOCKED: the agents (ScriptedAgents — no LLM), the network (mockWeb) and Figma (FakeFigma). These tests do
 * not prove live Figma, live web research or model behaviour.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MagecRuntime, runAutonomous } from '@ui-ux-magec/runtime';
import { sandbox } from '../helpers/env.js';
import { FakePluginTransport } from '../helpers/fake-transport.js';
import { ScriptedAgents, mockWeb } from '../helpers/scripted-agents.js';

let env: ReturnType<typeof sandbox>;
let transport: FakePluginTransport;
beforeEach(() => {
  env = sandbox();
  transport = new FakePluginTransport();
});
afterEach(() => env.cleanup());

const runtime = () => MagecRuntime.create({ projectDir: env.dir, transport, fetch: mockWeb, stderr: false, researchHostIntervalMs: 0 });

async function newAgencyProject() {
  const rt = await runtime();
  await rt.initProject({ name: 'Northlight Agency', brief: 'Create a premium digital marketing agency website using this logo.', languages: ['en', 'ar'] });
  mkdirSync(join(env.dir, 'assets/logos'), { recursive: true });
  writeFileSync(join(env.dir, 'assets/logos/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await rt.requireProject().orchestrator.planNewProject();
  return rt;
}

describe('Scenario A — new website from scratch (mocked agents/Figma/web)', () => {
  it('produces requirements, research, concepts, design system, editable Figma pages, QA and persisted state', async () => {
    const rt = await newAgencyProject();
    const agents = new ScriptedAgents();
    const r = await runAutonomous(rt, agents, { maxTasks: 60 });
    expect(r.stoppedBecause).toBe('no runnable tasks');
    const p = rt.requireProject();
    const tasks = await p.tasks.list();
    expect(tasks.filter((t) => t.status !== 'completed').map((t) => `${t.type}:${t.status}`)).toEqual([]);
    expect(await p.ws.readArtifactJson('planning/product-analysis.json')).toMatchObject({ sitemap: expect.any(Array), features: expect.any(Array) });
    expect(await p.ws.readArtifactJson('planning/brand-analysis.json')).toBeTruthy();
    const refs = await p.references.list({ includeRejected: true });
    expect(refs.filter((x) => x.verified).length).toBe(4);
    expect(refs.find((x) => x.source === 'mobbin')?.verified).toBe(false);
    expect(new Set(refs.filter((x) => x.verified).map((x) => x.source)).size).toBeGreaterThanOrEqual(3);
    expect((await p.memory.activeDecisions()).some((d) => d.topic === 'concept:project' && d.status === 'accepted')).toBe(true);
    expect(await p.ws.readArtifactJson('design-system/design-system.json')).toBeTruthy();
    // Editable, native Figma output in the (mock) file.
    expect(transport.figma.page('Home')).toBeDefined();
    expect(transport.figma.page('Components')).toBeDefined();
    expect(transport.figma.byLogicalId('screen/home-desktop/hero/copy/title')[0]!.type).toBe('TEXT');
    expect(transport.figma.byLogicalId('componentset/button')[0]!.type).toBe('COMPONENT_SET');
    expect(transport.figma.collections.length).toBe(1);
    // Every container in the screens is auto layout (read back from the document, not the spec).
    const frames = transport.figma.owned(p.ws.projectId).filter((n: any) => (n.type === 'FRAME' || n.type === 'COMPONENT') && n.children?.length && n.getPluginData('magec.logicalId').startsWith('screen/'));
    expect(frames.length).toBeGreaterThan(3);
    for (const f of frames) expect(f.layoutMode, f.name).not.toBe('NONE');
    // Assets: a stock photo and an icon with provenance, placed in the design; reference images kept separately.
    const library = JSON.parse(readFileSync(p.ws.resolveProject('assets/assets.json'), 'utf8'));
    const photo = library.assets.find((a: any) => a.kind === 'image');
    expect(photo).toMatchObject({ origin: 'stock', license: 'unsplash', author: 'Mock Photographer', path: expect.stringMatching(/^assets\/images\//) });
    expect(existsSync(p.ws.resolveProject(photo.path))).toBe(true);
    expect(library.assets.find((a: any) => a.kind === 'icon')).toMatchObject({ origin: 'icon-set', license: 'isc', path: 'assets/icons/lucide-arrow-right.svg' });
    expect(readFileSync(p.ws.resolveProject('assets/icons/lucide-arrow-right.svg'), 'utf8')).not.toMatch(/<!--|class=/);
    expect(library.assets.filter((a: any) => a.kind === 'reference').length).toBeGreaterThan(0);
    expect(library.assets.filter((a: any) => a.kind === 'reference').every((a: any) => a.path.startsWith('assets/references/'))).toBe(true);
    const visual = transport.figma.byLogicalId('screen/home-desktop/hero/visual')[0]!;
    expect(visual.fills[0].type).toBe('IMAGE');
    expect(transport.figma.byLogicalId('screen/home-desktop/hero/copy/cta-icon')).toHaveLength(1);
    // Only must/should pages are designed ("could" pages are not).
    expect(tasks.some((t) => t.type === 'figma-page-design' && t.params.page === 'careers')).toBe(false);
    const qa = tasks.filter((t) => t.type === 'design-qa');
    expect(qa.length).toBeGreaterThan(0);
    expect(existsSync(p.ws.resolve(qa[0]!.outputRefs[0]!))).toBe(true);
    const state = await p.ws.getState();
    expect(state.completedStages).toEqual(expect.arrayContaining(['requirements-completed', 'research-completed', 'concept-selected', 'design-system-created', 'figma-foundations-created', 'page-designed:home', 'qa-completed:home']));
    expect((await p.ws.listCheckpoints()).length).toBeGreaterThanOrEqual(4);
    expect(p.ws.getProject().status).toBe('completed');
    await rt.close();
  });

  it('runs the bounded QA → fix → QA loop when QA fails', async () => {
    const rt = await newAgencyProject();
    await runAutonomous(rt, new ScriptedAgents({ qaFailFirst: true }), { maxTasks: 60 });
    const tasks = await rt.requireProject().tasks.list();
    expect(tasks.filter((t) => t.type === 'figma-fix')).toHaveLength(1);
    expect(tasks.filter((t) => t.type === 'design-qa').map((t) => t.params.iteration).sort()).toEqual([1, 2]);
    expect(tasks.every((t) => t.status === 'completed')).toBe(true);
    await rt.close();
  });
});

describe('Scenario D — resume project', () => {
  it('continues from persisted state without repeating completed work or duplicating Figma nodes', async () => {
    const rt1 = await newAgencyProject();
    const first = new ScriptedAgents();
    await runAutonomous(rt1, first, { maxTasks: 9 });
    const completedBefore = (await rt1.requireProject().tasks.list({ status: ['completed'] })).map((t) => t.taskId);
    // Simulate a crash mid-task: one task left "running".
    const p1 = rt1.requireProject();
    const [ready] = await p1.tasks.ready();
    if (ready) await p1.tasks.claim(ready.taskId, 'crashed-session');
    await rt1.close();

    const rt2 = await runtime();
    const report = await rt2.requireProject().orchestrator.resume();
    expect(report.validation.ok).toBe(true);
    if (ready) expect(report.recoveredTasks).toContain(ready.taskId);
    const second = new ScriptedAgents();
    await runAutonomous(rt2, second, { maxTasks: 60 });
    const p2 = rt2.requireProject();
    const all = await p2.tasks.list();
    // Completed work was not redone: each previously completed task still has exactly one attempt.
    for (const id of completedBefore) expect(all.find((t) => t.taskId === id)!.attempt).toBe(1);
    expect(second.calls.filter((c) => c.type === 'product-analysis')).toHaveLength(0);
    expect(all.every((t) => t.status === 'completed')).toBe(true);
    expect(transport.figma.byLogicalId('screen/home-desktop')).toHaveLength(1);
    await rt2.close();
  });
});

describe('Scenario E — design rejected', () => {
  it('redesigns only the hero with a different concept and records the rejection', async () => {
    const rt = await newAgencyProject();
    await runAutonomous(rt, new ScriptedAgents(), { maxTasks: 60 });
    const p = rt.requireProject();
    const componentsBefore = transport.figma.byLogicalId('componentset/button')[0]!.id;
    const nodesBefore = transport.figma.owned(p.ws.projectId).length;
    const out = await p.orchestrator.processFeedback("I don't like the hero. Create a completely different concept.");
    expect(out.interpretation.intent).toBe('redesign');
    expect(out.interpretation.scope.sections).toEqual(['hero']);
    expect(out.tasks.map((t) => t.type)).toEqual(expect.arrayContaining(['research', 'concept-generation', 'figma-page-design', 'design-qa']));
    expect(out.tasks.find((t) => t.type === 'concept-generation')!.params.avoidRejected).toBe(true);
    const rr = await runAutonomous(rt, new ScriptedAgents({ heroTitle: () => 'Creativity, measured.' }), { maxTasks: 30 });
    expect(rr.stoppedBecause).toBe('no runnable tasks');
    expect(transport.figma.byLogicalId('screen/home-desktop/hero/copy/title')[0]!.characters).toBe('Creativity, measured.');
    // Unrelated approved work is preserved: same component set node, no duplicated nodes.
    expect(transport.figma.byLogicalId('componentset/button')[0]!.id).toBe(componentsBefore);
    expect(transport.figma.owned(p.ws.projectId).length).toBe(nodesBefore);
    const rejected = await p.memory.rejectedDirections();
    expect(rejected.some((d) => d.scope === 'section:hero')).toBe(true);
    expect((await p.memory.listFeedback()).at(-1)!.text).toMatch(/hero/);
    const ctx = await p.orchestrator.contextPack();
    expect(ctx).toMatch(/Rejected directions/);
    await rt.close();
  });
});

describe('Scenario F — deleted experiment', () => {
  it('after deleting workspace and Figma design, nothing is restored and a new start is independent', async () => {
    const rt = await newAgencyProject();
    await runAutonomous(rt, new ScriptedAgents(), { maxTasks: 60 });
    const oldId = rt.requireProject().ws.projectId;
    for (const n of transport.figma.owned(oldId)) if (!n.removed && n.type !== 'PAGE') n.remove();
    await rt.requireProject().ws.destroy({ includeAssets: true });
    await rt.close();

    const rt2 = await runtime();
    expect(rt2.hasProject).toBe(false);
    const status = await rt2.tools.invoke('magec_project_status', {}, { agentId: 'master-orchestrator' });
    expect(status.ok && (status.result as { project: unknown }).project).toBe(null);
    expect(transport.figma.owned(oldId).filter((n) => n.type !== 'PAGE')).toHaveLength(0);
    const p = await rt2.initProject({ name: 'Northlight Agency' });
    expect(p.ws.projectId).not.toBe(oldId);
    expect(await p.tasks.list()).toEqual([]);
    expect(await p.references.list({ includeRejected: true })).toEqual([]);
    expect(await p.figma.mappings()).toEqual([]);
    await rt2.close();
  });
});

describe('Scenario H — failed Figma write', () => {
  it('records the failure, never reports false success, retries without duplicates and leaves other work intact', async () => {
    const rt = await newAgencyProject();
    const p = rt.requireProject();
    let injected = false;
    const agents = new ScriptedAgents();
    await runAutonomous(rt, {
      name: agents.name, available: true,
      run: async (req) => {
        if (req.task.type === 'figma-page-design' && !injected) {
          injected = true;
          transport.figma.failNext.set('createFRAME', new Error('Figma plugin error: node limit reached (simulated)'));
          // The scripted agent reports the tool failure honestly via magec_task_fail.
          try {
            return await agents.run(req);
          } catch (err) {
            await req.invoke('magec_task_fail', { taskId: req.task.taskId, message: (err as Error).message, kind: 'external', retryable: true });
            return { status: 'ended', finalText: '', turns: 1, toolCalls: 1 };
          }
        }
        return agents.run(req);
      },
    }, { maxTasks: 60 });
    const page = (await p.tasks.list({ type: 'figma-page-design' }))[0]!;
    expect(page.errors[0]!.message).toMatch(/node limit reached/);
    expect(page.attempt).toBe(2);
    expect(page.status).toBe('completed');
    const journal = await p.figma.journal();
    expect(journal.some((j) => j.status === 'failed' && /node limit/.test(j.error ?? ''))).toBe(true);
    expect(transport.figma.byLogicalId('screen/home-desktop')).toHaveLength(1);
    expect(transport.figma.byLogicalId('screen/home-desktop/hero/visual')).toHaveLength(1);
    await rt.close();
  });
});

describe('Scenario B — feature-specific research', () => {
  it('researches hero sections across sources with verified, deduplicated, attributed references', async () => {
    const rt = await runtime();
    await rt.initProject({ name: 'Northlight Agency', industry: 'digital marketing agency' });
    const p = rt.requireProject();
    const planned = await p.orchestrator.planResearch('Research creative hero sections for this project.');
    expect(planned.map((t) => t.params.category)).toEqual(['hero-section', 'hero-section', 'hero-section']);
    const r = await runAutonomous(rt, new ScriptedAgents(), { maxTasks: 10 });
    expect(r.stoppedBecause).toBe('no runnable tasks');
    const refs = await p.references.list({ includeRejected: true });
    const verified = refs.filter((x) => x.verified);
    expect(new Set(verified.map((x) => x.source)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(refs.map((x) => x.canonical_url)).size).toBe(refs.length);
    for (const ref of verified) expect(ref.verification.retrieved_at && ref.discovered_by.provider).toBeTruthy();
    expect(refs.filter((x) => !x.verified).map((x) => x.verification.failure).join(' ')).toMatch(/requires login|http-error/);
    const report = await p.ws.readArtifactJson<{ sourcesTried: unknown[]; approaches: unknown[] }>('research/report-hero-section.json');
    expect(report!.sourcesTried.length).toBeGreaterThan(1);
    expect((await p.tasks.list({ type: 'visual-analysis' }))[0]!.status).toBe('completed');
    await rt.close();
  });
});

describe('Scenario C — existing Figma project (extend mode)', () => {
  it('reads the existing design, finds gaps, adds missing screens reusing existing components and preserves user work', async () => {
    // The user's existing (non-ui-ux-magec) design in the mock file.
    const f = transport.figma;
    const home = f.currentPage;
    home.name = 'Home';
    const userFrame = f.createFrame();
    userFrame.name = 'Home — Desktop';
    const userText = f.createText();
    userFrame.appendChild(userText);
    userText.characters = 'Existing hero by the design team';
    const compsPage = f.createPage();
    compsPage.name = 'Components';
    f.currentPage = compsPage;
    const userButton = f.createComponent();
    userButton.name = 'Button';
    f.currentPage = home;
    const componentCount = () => [...f.nodes.values()].filter((n) => !n.removed && (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET')).length;
    const before = componentCount();

    const rt = await runtime();
    await rt.initProject({ name: 'Existing app', mode: 'existing', settings: { breakpoints: ['desktop'] } });
    const p = rt.requireProject();
    await p.orchestrator.planAudit('extend', 'Analyze this existing project and complete the missing screens.');
    const r = await runAutonomous(rt, new ScriptedAgents(), { maxTasks: 40 });
    expect(r.stoppedBecause).toBe('no runnable tasks');
    expect((await p.tasks.list()).filter((t) => t.status !== 'completed').map((t) => `${t.type}:${t.status}:${t.errors.at(-1)?.message}`)).toEqual([]);
    expect(await p.ws.readArtifactJson('figma/snapshot.json')).toBeTruthy();
    const audit = await p.ws.readArtifactJson<{ existingSystem: { components: string[] }; gaps: unknown[] }>('reports/ux-audit.json');
    expect(audit!.existingSystem.components).toContain('Button');
    expect(audit!.gaps.length).toBeGreaterThan(0);
    // Missing screen created on its own page, using an instance of the user's Button (no duplicate component).
    const cta = f.byLogicalId('screen/pricing-desktop/plans/cta')[0]!;
    expect(cta.type).toBe('INSTANCE');
    expect(cta.mainComponent).toBe(userButton);
    expect(componentCount()).toBe(before);
    // Existing work untouched and not claimed.
    expect(userText.characters).toBe('Existing hero by the design team');
    expect(userFrame.getPluginData('magec.projectId')).toBe('');
    expect(userFrame.parent).toBe(home);
    await rt.close();
  });
});
