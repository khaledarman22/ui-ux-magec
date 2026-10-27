// Runs the REAL plugin executor against a MOCK Figma document (tests/helpers/fake-figma.ts).
import { describe, expect, it } from 'vitest';
import { compileDesign } from '@ui-ux-magec/design-engine';
import { createExecutor } from '../../apps/figma-plugin/src/executor.js';
import { FakeFigma } from '../helpers/fake-figma.js';
import { homeSpec, tokens } from '../helpers/fixtures.js';

const PID = 'prj_test';
function setup() {
  const figma = new FakeFigma({ fileKey: 'K' });
  const exec = createExecutor(figma as unknown as PluginAPI);
  const run = (op: Record<string, unknown>) => exec.execute(op as never) as Promise<any>;
  return { figma, run };
}

async function writeHome(run: (op: Record<string, unknown>) => Promise<any>, figma: FakeFigma, spec = homeSpec(), extra: Record<string, unknown> = {}) {
  const compiled = compileDesign(spec, tokens());
  const page = await run({ op: 'ensure_page', projectId: PID, name: 'Components' });
  for (const v of compiled.components[0]!.variants) await run({ op: 'upsert_tree', projectId: PID, parent: { pageId: page.pageId }, tree: v.tree });
  const home = await run({ op: 'ensure_page', projectId: PID, name: 'Home' });
  return run({ op: 'upsert_tree', projectId: PID, parent: { pageId: home.pageId }, tree: compiled.screens[0]!.tree, ...extra });
}

describe('plugin executor (mock Figma)', () => {
  it('creates native, editable nodes: auto-layout frames, text layers and instances', async () => {
    const { figma, run } = setup();
    const res = await writeHome(run, figma);
    expect(res.conflicts).toBeUndefined();
    const root = figma.byLogicalId('screen/home-desktop')[0]!;
    expect(root.type).toBe('FRAME');
    const hero = figma.byLogicalId('screen/home-desktop/hero')[0]!;
    expect(hero.layoutMode).toBe('HORIZONTAL');
    const title = figma.byLogicalId('screen/home-desktop/hero/copy/title')[0]!;
    expect(title.type).toBe('TEXT');
    expect(title.characters).toMatch(/Grow your brand/);
    const cta = figma.byLogicalId('screen/home-desktop/hero/copy/cta')[0]!;
    expect(cta.type).toBe('INSTANCE');
    expect(cta.findOne((n: any) => n.name === 'Label')!.characters).toBe('Book a call');
  });

  it('re-applying the same tree updates in place and never duplicates', async () => {
    const { figma, run } = setup();
    await writeHome(run, figma);
    const before = figma.owned(PID).length;
    const res = await writeHome(run, figma);
    expect(figma.owned(PID).length).toBe(before);
    expect(res.nodes.every((n: any) => n.action === 'updated')).toBe(true);
    for (const lid of ['screen/home-desktop', 'screen/home-desktop/hero/copy/title']) expect(figma.byLogicalId(lid)).toHaveLength(1);
  });

  it('refuses to overwrite nodes edited by the user (fingerprint conflict) and mutates nothing', async () => {
    const { figma, run } = setup();
    const first = await writeHome(run, figma);
    const fp = Object.fromEntries(first.nodes.map((n: any) => [n.logicalId, n.fingerprint]));
    const title = figma.byLogicalId('screen/home-desktop/hero/copy/title')[0]!;
    title.characters = 'Edited by the designer';
    const res = await writeHome(run, figma, homeSpec('A brand new headline'), { expectedFingerprints: fp });
    expect(res.conflicts.map((c: any) => c.logicalId)).toEqual(['screen/home-desktop/hero/copy/title']);
    expect(title.characters).toBe('Edited by the designer');
  });

  it('keeps the position of frames the user moved', async () => {
    const { figma, run } = setup();
    await writeHome(run, figma);
    const root = figma.byLogicalId('screen/home-desktop')[0]!;
    root.x = 5000;
    await writeHome(run, figma);
    expect(root.x).toBe(5000);
  });

  it('only deletes owned nodes and only with an authorization id', async () => {
    const { figma, run } = setup();
    await writeHome(run, figma);
    const userFrame = figma.createFrame();
    userFrame.name = 'Designer notes';
    const owned = figma.byLogicalId('screen/home-desktop/hero/visual')[0]!;
    await expect(run({ op: 'delete_nodes', projectId: PID, nodeIds: [owned.id] })).rejects.toThrow(/authorization/);
    const r = await run({ op: 'delete_nodes', projectId: PID, nodeIds: [owned.id, userFrame.id], authorization: 'tsk_approved' });
    expect(r.deleted).toEqual([owned.id]);
    expect(r.skipped).toEqual([userFrame.id]);
    expect(userFrame.removed).toBe(false);
  });

  it('falls back to Inter and reports missing fonts instead of failing silently', async () => {
    const { figma, run } = setup();
    const spec = homeSpec();
    const t = tokens();
    t.typography.h1!.fontFamily = 'Nonexistent Grotesk';
    const compiled = compileDesign(spec, t);
    const page = await run({ op: 'ensure_page', projectId: PID, name: 'Components' });
    for (const v of compiled.components[0]!.variants) await run({ op: 'upsert_tree', projectId: PID, parent: { pageId: page.pageId }, tree: v.tree });
    const home = await run({ op: 'ensure_page', projectId: PID, name: 'Home' });
    const res = await run({ op: 'upsert_tree', projectId: PID, parent: { pageId: home.pageId }, tree: compiled.screens[0]!.tree });
    expect(res.missingFonts).toContain('Nonexistent Grotesk::Bold');
    expect(res.warnings.join(' ')).toMatch(/unavailable/);
    expect(figma.byLogicalId('screen/home-desktop/hero/copy/title')[0]!.fontName.family).toBe('Inter');
  });

  it('creates variables with modes and binds color tokens', async () => {
    const { figma, run } = setup();
    const r = await run({ op: 'upsert_variables', projectId: PID, collection: 'Tokens', modes: ['light', 'dark'], variables: [{ name: 'color/primary', type: 'COLOR', values: { light: '#4F46E5', dark: '#818CF8' } }] });
    expect(r.created).toBe(1);
    const again = await run({ op: 'upsert_variables', projectId: PID, collection: 'Tokens', modes: ['light', 'dark'], variables: [{ name: 'color/primary', type: 'COLOR', values: { light: '#4338CA', dark: '#818CF8' } }] });
    expect(again).toMatchObject({ created: 0, updated: 1 });
    expect(figma.collections[0].modes.map((m: any) => m.name)).toEqual(['light', 'dark']);
  });

  it('rejects operations outside the whitelist', async () => {
    const { run } = setup();
    await expect(run({ op: 'eval', code: '1+1' })).rejects.toThrow(/unsupported/);
  });
});
