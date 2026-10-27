// Asset library, licensing rules and SVG safety. The network is MOCKED (mockWeb); no real downloads.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MagecRuntime } from '@ui-ux-magec/runtime';
import { freeImageHost, isInspirationHost, sanitizeSvg, UnsafeSvgError, type ImageSearchProvider } from '@ui-ux-magec/research';
import { sandbox } from '../helpers/env.js';
import { FakePluginTransport } from '../helpers/fake-transport.js';
import { mockWeb } from '../helpers/scripted-agents.js';

describe('asset rules (pure)', () => {
  it('sanitizes SVG: strips scripts, handlers, external links and comments; rejects non-SVG', () => {
    const svg = sanitizeSvg('<?xml version="1.0"?><!-- x --><svg onload="alert(1)" class="a"><script>alert(1)</script><a href="https://evil.example"><path d="M0 0" /></a><use href="#local"/></svg>');
    expect(svg).not.toMatch(/script|onload|evil|<!--|class=/);
    expect(svg).toMatch(/href="#local"/);
    expect(() => sanitizeSvg('<html><body>hi</body></html>')).toThrow(UnsafeSvgError);
  });

  it('tells design galleries apart from free-license image libraries', () => {
    for (const u of ['https://dribbble.com/shots/1', 'https://cdn.dribbble.com/x.png', 'https://mir-s3-cdn-cf.behance.net/p.jpg', 'https://i.pinimg.com/a.jpg']) expect(isInspirationHost(u), u).toBe(true);
    expect(isInspirationHost('https://images.unsplash.com/photo-1')).toBe(false);
    expect(freeImageHost('https://images.pexels.com/p.jpg')).toEqual({ provider: 'pexels', license: 'pexels' });
    expect(freeImageHost('https://randomblog.example/p.jpg')).toBeNull();
  });
});

describe('asset tools', () => {
  let env: ReturnType<typeof sandbox>;
  let rt: MagecRuntime;
  const as = (agentId: string) => async (name: string, input: Record<string, unknown> = {}) => (await rt.tools.invoke(name, input, { agentId })) as any;
  /** MOCK stock API returning one candidate. */
  const mockStock: ImageSearchProvider = {
    id: 'unsplash', available: true,
    search: async () => [{ provider: 'unsplash', id: 'abc', description: 'team in a workshop', downloadUrl: 'https://images.unsplash.com/photo-abc?fm=jpg', previewUrl: 'https://images.unsplash.com/photo-abc?w=400', sourcePage: 'https://unsplash.com/photos/abc', author: 'Jane Doe', license: 'unsplash', licenseUrl: 'https://unsplash.com/license', width: 4000, height: 3000 }],
  };

  beforeEach(async () => {
    env = sandbox();
    rt = await MagecRuntime.create({ projectDir: env.dir, transport: new FakePluginTransport(), fetch: mockWeb, imageProviders: [mockStock], stderr: false, researchHostIntervalMs: 0 });
    await rt.initProject({ name: 'Assets' });
  });
  afterEach(async () => {
    await rt.close();
    env.cleanup();
  });

  it('downloads stock photos with provenance and stores identical files once', async () => {
    const agent = as('asset-agent');
    const found = await agent('magec_image_search', { query: 'team workshop' });
    expect(found.result.candidates[0]).toMatchObject({ candidateId: 'unsplash:abc', author: 'Jane Doe', license: 'unsplash' });
    const first = await agent('magec_asset_download', { candidateId: 'unsplash:abc', purpose: 'hero/photo', name: 'Hero team' });
    expect(first.result.asset).toMatchObject({ path: 'assets/images/hero-team.jpg', license: 'unsplash', author: 'Jane Doe', sourcePage: 'https://unsplash.com/photos/abc' });
    expect(existsSync(join(env.dir, 'assets/images/hero-team.jpg'))).toBe(true);
    const again = await agent('magec_asset_download', { candidateId: 'unsplash:abc', purpose: 'about/photo', name: 'About team' });
    expect(again.result.duplicate).toBe(true);
    expect(again.result.asset.assetId).toBe(first.result.asset.assetId);
  });

  it('refuses gallery images and hosts without a free license', async () => {
    const agent = as('asset-agent');
    const gallery = await agent('magec_asset_download', { url: 'https://cdn.dribbble.com/shot.png', sourcePage: 'https://dribbble.com/shots/1', purpose: 'hero', name: 'x' });
    expect(gallery.ok).toBe(false);
    expect(gallery.error.message).toMatch(/design galleries/);
    const unknown = await agent('magec_asset_download', { url: 'https://randomblog.example/p.jpg', sourcePage: 'https://randomblog.example/post', purpose: 'hero', name: 'x' });
    expect(unknown.ok).toBe(false);
    expect(unknown.error.message).toMatch(/only images hosted by/);
  });

  it('fetches icons as sanitized SVG and reports names the set does not have', async () => {
    const r = await as('asset-agent')('magec_icon_get', { set: 'lucide', names: ['arrow-right', 'no-such-icon'] });
    expect(r.result.icons.map((i: any) => i.path)).toEqual(['assets/icons/lucide-arrow-right.svg']);
    expect(r.result.missing[0].name).toBe('no-such-icon');
    expect(readFileSync(join(env.dir, 'assets/icons/lucide-arrow-right.svg'), 'utf8')).toMatch(/^<svg/);
  });

  it('registers generated images only with their prompt, and only from inside the project', async () => {
    const agent = as('asset-agent');
    writeFileSync(join(env.dir, 'gen.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    const noPrompt = await agent('magec_asset_register', { path: 'gen.png', kind: 'image', origin: 'generated', purpose: 'hero/photo', name: 'hero' });
    expect(noPrompt.ok).toBe(false);
    const ok = await agent('magec_asset_register', { path: 'gen.png', kind: 'image', origin: 'generated', purpose: 'hero/photo', name: 'hero', generation: { tool: 'host-image-tool', prompt: 'warm studio photo of a creative team' } });
    expect(ok.error?.message ?? '').toBe('');
    expect(ok.result.asset).toMatchObject({ path: 'assets/images/hero.png', origin: 'generated', license: 'generated' });
    const outside = await agent('magec_asset_register', { path: '/etc/hosts', kind: 'image', origin: 'user', purpose: 'x', name: 'x' });
    expect(outside.ok).toBe(false);
    const state = await agent('magec_asset_register', { path: '.ui-ux-magec/project.json', kind: 'image', origin: 'user', purpose: 'x', name: 'x' });
    expect(state.ok).toBe(false);
  });

  it('permissions: only the asset agent writes assets, only the designer writes Figma', async () => {
    expect((await as('figma-designer')('magec_icon_get', { names: ['arrow-right'] })).ok).toBe(false);
    expect((await as('creative-director')('magec_asset_download', { candidateId: 'unsplash:abc', purpose: 'x', name: 'x' })).ok).toBe(false);
    expect(rt.tools.allowedFor('asset-agent').some((t) => t.name.startsWith('magec_figma_apply'))).toBe(false);
  });

  it('rejects an asset report that claims files not in the library', async () => {
    const p = rt.requireProject();
    const [task] = await p.tasks.create([{ idempotencyKey: 'assets:home', agent: 'asset-agent', type: 'asset-sourcing', title: 'Assets', params: { page: 'home' } }]);
    const agent = as('asset-agent');
    await agent('magec_task_start', { taskId: task!.taskId });
    const r = await agent('magec_task_complete', { taskId: task!.taskId, output: { page: 'home', strategy: { imageGeneration: 'unavailable' }, images: [{ slot: 'hero/photo', assetId: 'ast_fake', path: 'assets/images/fake.jpg' }], icons: [] } });
    expect(r.result.accepted).toBe(false);
    expect(r.result.errors.join(' ')).toMatch(/not in the asset library/);
  });
});
