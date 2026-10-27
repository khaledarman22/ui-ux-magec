import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Workspace } from '@ui-ux-magec/workspace';
import { ReferenceStore, canonicalizeUrl, rankReferences } from '@ui-ux-magec/reference-intelligence';
import { sandbox } from '../helpers/env.js';

let env: ReturnType<typeof sandbox>;
let store: ReferenceStore;
beforeEach(async () => {
  env = sandbox();
  store = new ReferenceStore(await Workspace.init(env.dir, { name: 'Refs' }));
});
afterEach(() => env.cleanup());

const base = { category: 'hero-section', verified: true, discovered_by: { provider: 'test' } };

describe('reference deduplication', () => {
  it('canonicalizes tracking parameters, hosts and platform slugs', () => {
    expect(canonicalizeUrl('https://www.behance.net/gallery/123456/Some-Agency-Site?utm_source=x&fbclid=1')).toBe(canonicalizeUrl('https://behance.net/gallery/123456/other-slug'));
    expect(canonicalizeUrl('https://dribbble.com/shots/998877-Hero-concept?utm_medium=y')).toBe(canonicalizeUrl('https://dribbble.com/shots/998877'));
    expect(canonicalizeUrl('https://example.com/a?ref=z#top')).toBe(canonicalizeUrl('https://example.com/a'));
  });

  it('detects duplicates by canonical url, source item id and near-identical titles on the same host', async () => {
    const a = await store.add({ ...base, source: 'behance', source_url: 'https://www.behance.net/gallery/123456/Agency-Hero', title: 'Agency Hero' });
    expect(a.duplicateOf).toBeUndefined();
    const b = await store.add({ ...base, source: 'behance', source_url: 'https://behance.net/gallery/123456/agency-hero?utm_source=pin', title: 'Agency Hero' });
    expect(b.duplicateOf?.referenceId).toBe(a.reference.reference_id);
    await store.add({ ...base, source: 'web', source_url: 'https://studio.example/work/one', title: 'Studio Nova Creative Agency Portfolio Hero' });
    const d = await store.add({ ...base, source: 'web', source_url: 'https://studio.example/work/one-copy', title: 'Studio Nova Creative Agency Portfolio Hero' });
    expect(d.duplicateOf).toBeDefined();
    expect((await store.list()).length).toBe(2);
  });

  it('upgrades an unverified duplicate to verified but never downgrades', async () => {
    const u = await store.add({ ...base, verified: false, source: 'dribbble', source_url: 'https://dribbble.com/shots/42-x' });
    await store.add({ ...base, verified: true, source: 'dribbble', source_url: 'https://dribbble.com/shots/42' });
    expect((await store.get(u.reference.reference_id))!.verified).toBe(true);
    await store.add({ ...base, verified: false, source: 'dribbble', source_url: 'https://dribbble.com/shots/42' });
    expect((await store.get(u.reference.reference_id))!.verified).toBe(true);
  });

  it('refuses analysis of unverified references unless it came from a screenshot', async () => {
    const u = await store.add({ ...base, verified: false, source: 'mobbin', source_url: 'https://mobbin.com/screens/abc' });
    await expect(store.saveAnalysis({ reference_id: u.reference.reference_id, analyzed_by: 't', inspected: { method: 'preview-image' } } as never)).rejects.toThrow(/unverified/);
  });
});

describe('ranking with diversity', () => {
  it('prefers relevant, verified, less-used and stylistically diverse references', async () => {
    const mk = async (n: number, style: string[], used = 0, verified = true) => {
      const r = await store.add({ ...base, verified, source: n % 2 ? 'dribbble' : 'behance', source_url: `https://dribbble.com/shots/${n}`, title: ['Calm residences landing', 'Lakeside villas showcase', 'Brutalist property launch', 'Playful rentals hero'][n - 1]!, style, industry: 'real estate' });
      if (used) await store.update(r.reference.reference_id, { usage_count: used });
      return r.reference.reference_id;
    };
    const minimal1 = await mk(1, ['minimal']);
    await mk(2, ['minimal']);
    const bold = await mk(3, ['bold', 'editorial']);
    const unverified = await mk(4, ['playful'], 0, false);
    const ranked = rankReferences(await store.list(), { category: 'hero-section', industry: 'real estate', keywords: ['hero'] }, { limit: 3 });
    const ids = ranked.map((r) => r.reference.reference_id);
    expect(ids).not.toContain(unverified);
    expect(ids.slice(0, 2)).toContain(bold);
    expect(ids).toContain(minimal1);
  });
});
