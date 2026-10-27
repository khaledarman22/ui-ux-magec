// Coordinator + REAL plugin executor against a MOCK Figma document (no live Figma involved).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Workspace } from '@ui-ux-magec/workspace';
import { FigmaBridgeError, FigmaWriteCoordinator } from '@ui-ux-magec/figma-bridge';
import { compileDesign, type CompiledDesign } from '@ui-ux-magec/design-engine';
import { sandbox } from '../helpers/env.js';
import { FakePluginTransport } from '../helpers/fake-transport.js';
import { homeSpec, tokens } from '../helpers/fixtures.js';

let env: ReturnType<typeof sandbox>;
let ws: Workspace;
let transport: FakePluginTransport;
let figma: FigmaWriteCoordinator;

beforeEach(async () => {
  env = sandbox();
  ws = await Workspace.init(env.dir, { name: 'Figma' });
  transport = new FakePluginTransport();
  figma = new FigmaWriteCoordinator(ws, transport);
});
afterEach(() => env.cleanup());

async function applyAll(c: CompiledDesign, opts: { taskId?: string; overwriteAuthorization?: string } = {}) {
  const results = [];
  for (const comp of c.components) for (const v of comp.variants) results.push(await figma.applyTree({ tree: v.tree, page: comp.page, specHash: v.specHash, agent: 'figma-designer', ...opts }));
  for (const s of c.screens) results.push(await figma.applyTree({ tree: s.tree, page: s.page, specHash: s.specHash, agent: 'figma-designer', ...opts }));
  return results;
}
const ownedCount = () => transport.figma.owned(ws.projectId).filter((n) => n.type !== 'PAGE').length;

describe('Figma node mapping', () => {
  it('records a confirmed mapping for every written node and adopts the file', async () => {
    await applyAll(compileDesign(homeSpec(), tokens()));
    const mappings = await figma.mappings();
    expect(mappings.length).toBe(ownedCount());
    for (const m of mappings) {
      expect(m.status).toBe('active');
      const live = transport.figma.nodes.get(m.nodeId)!;
      expect(live.getPluginData('magec.logicalId')).toBe(m.logicalId);
    }
    expect(ws.getProject().figma.fileKey).toBe('FAKEFILEKEY1');
    expect((await figma.journal()).filter((j) => j.status === 'confirmed').length).toBeGreaterThan(0);
  });

  it('refuses to write into a different Figma file than the one linked to the project', async () => {
    await applyAll(compileDesign(homeSpec(), tokens()));
    transport.figma.fileKey = 'OTHERFILE';
    await expect(applyAll(compileDesign(homeSpec(), tokens()))).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('duplicate-write prevention', () => {
  it('skips unchanged specs entirely and updates changed specs in place', async () => {
    const c = compileDesign(homeSpec(), tokens());
    await applyAll(c);
    const count = ownedCount();
    const writesBefore = transport.log.filter((l) => l.op === 'upsert_tree').length;
    const again = await applyAll(c);
    expect(again.every((r) => r.skipped)).toBe(true);
    expect(transport.log.filter((l) => l.op === 'upsert_tree').length).toBe(writesBefore);
    const changed = await applyAll(compileDesign(homeSpec('A sharper headline'), tokens()));
    expect(changed.some((r) => !r.skipped)).toBe(true);
    expect(ownedCount()).toBe(count);
    expect(transport.figma.byLogicalId('screen/home-desktop/hero/copy/title')[0]!.characters).toBe('A sharper headline');
  });
});

describe('conflict detection', () => {
  it('never silently overwrites user edits; overwriting needs explicit authorization', async () => {
    await applyAll(compileDesign(homeSpec(), tokens()));
    const title = transport.figma.byLogicalId('screen/home-desktop/hero/copy/title')[0]!;
    title.characters = 'Designer copy';
    const err = await applyAll(compileDesign(homeSpec('Agent copy'), tokens())).catch((e) => e);
    expect(err).toBeInstanceOf(FigmaBridgeError);
    expect(err.code).toBe('conflict');
    expect(title.characters).toBe('Designer copy');
    expect((await figma.mapping('screen/home-desktop/hero/copy/title'))!.status).toBe('changed-externally');
    expect((await figma.journal()).at(-1)!.status).toBe('failed');
    await applyAll(compileDesign(homeSpec('Agent copy'), tokens()), { overwriteAuthorization: 'tsk_user_approved' });
    expect(title.characters).toBe('Agent copy');
  });

  it('reconcile reports externally edited and deleted nodes and never recreates them', async () => {
    await applyAll(compileDesign(homeSpec(), tokens()));
    transport.figma.byLogicalId('screen/home-desktop/hero/visual')[0]!.remove();
    transport.figma.byLogicalId('screen/home-desktop/hero/copy/title')[0]!.characters = 'Edited';
    const before = ownedCount();
    const r = await figma.reconcile();
    expect(r.missing).toContain('screen/home-desktop/hero/visual');
    expect(r.changedExternally).toContain('screen/home-desktop/hero/copy/title');
    expect(ownedCount()).toBe(before);
    expect(transport.figma.byLogicalId('screen/home-desktop/hero/visual')).toHaveLength(0);
  });
});

describe('interrupted operations', () => {
  it('a write applied in Figma whose confirmation was lost is recovered on retry without duplicates', async () => {
    const c = compileDesign(homeSpec(), tokens());
    for (const comp of c.components) for (const v of comp.variants) await figma.applyTree({ tree: v.tree, page: comp.page, specHash: v.specHash, agent: 'figma-designer' });
    transport.loseResponseFor = 'upsert_tree';
    const screen = c.screens[0]!;
    await expect(figma.applyTree({ tree: screen.tree, page: screen.page, specHash: screen.specHash, agent: 'figma-designer', taskId: 'tsk_1' })).rejects.toMatchObject({ code: 'timeout' });
    expect((await figma.journal()).at(-1)!.status).toBe('pending');
    const count = ownedCount();
    // A new process/session retries the same task.
    const fresh = new FigmaWriteCoordinator(await Workspace.open(env.dir), transport);
    await fresh.applyTree({ tree: screen.tree, page: screen.page, specHash: screen.specHash, agent: 'figma-designer', taskId: 'tsk_1' });
    expect(ownedCount()).toBe(count);
    expect(transport.figma.byLogicalId('screen/home-desktop')).toHaveLength(1);
    expect((await fresh.journal()).some((j) => j.status === 'recovered')).toBe(true);
  });

  it('a pending operation whose nodes never reached Figma is abandoned, not reported as success', async () => {
    const c = compileDesign(homeSpec(), tokens());
    for (const comp of c.components) for (const v of comp.variants) await figma.applyTree({ tree: v.tree, page: comp.page, specHash: v.specHash, agent: 'figma-designer' });
    transport.failBefore = { op: 'upsert_tree', error: new FigmaBridgeError('timeout', 'simulated: plugin froze') };
    const s = c.screens[0]!;
    await expect(figma.applyTree({ tree: s.tree, page: s.page, specHash: s.specHash, agent: 'figma-designer' })).rejects.toThrow();
    const r = await figma.recoverPending();
    expect(r.abandoned.length).toBe(1);
    expect(r.recovered.length).toBe(0);
    expect(await figma.mapping('screen/home-desktop')).toBeUndefined();
  });
});

describe('failed Figma write (scenario H)', () => {
  it('records the error accurately, writes no mapping and touches nothing else', async () => {
    const c = compileDesign(homeSpec(), tokens());
    await applyAll({ ...c, screens: [] });
    const userFrame = transport.figma.createFrame();
    userFrame.name = 'Unrelated user frame';
    transport.figma.failNext.set('createRECTANGLE', new Error('Figma: out of memory (simulated)'));
    const s = c.screens[0]!;
    const err = await figma.applyTree({ tree: s.tree, page: s.page, specHash: s.specHash, agent: 'figma-designer' }).catch((e) => e);
    expect(err.message).toMatch(/out of memory/);
    const last = (await figma.journal()).at(-1)!;
    expect(last.status).toBe('failed');
    expect(last.error).toMatch(/out of memory/);
    expect(await figma.mapping('screen/home-desktop')).toBeUndefined();
    expect(userFrame.removed).toBe(false);
    // Retry after the transient failure: no duplicates of the partially created nodes.
    await figma.applyTree({ tree: s.tree, page: s.page, specHash: s.specHash, agent: 'figma-designer' });
    expect(transport.figma.byLogicalId('screen/home-desktop')).toHaveLength(1);
    expect(transport.figma.byLogicalId('screen/home-desktop/hero/copy/title')).toHaveLength(1);
  });

  it('reports not_connected instead of pretending to write when the plugin is offline', async () => {
    transport.connected = false;
    const s = compileDesign(homeSpec(), tokens()).screens[0]!;
    await expect(figma.applyTree({ tree: s.tree, page: s.page, agent: 'figma-designer' })).rejects.toMatchObject({ code: 'not_connected' });
    expect(await figma.journal()).toEqual([]);
  });
});
