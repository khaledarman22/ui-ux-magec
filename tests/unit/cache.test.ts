import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CacheService } from '@ui-ux-magec/cache';

const dirs: string[] = [];
const make = (now: () => number = Date.now) => {
  const d = mkdtempSync(join(tmpdir(), 'magec-cache-'));
  dirs.push(d);
  return new CacheService(d, now);
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('cache invalidation', () => {
  it('expires entries by TTL but can serve stale data explicitly', async () => {
    let now = 1_000_000;
    const c = make(() => now);
    await c.set('research-results', 'q1', { hits: 3 }, { source: 'brave', ttlMs: 1000 });
    expect((await c.get('research-results', 'q1'))?.value).toEqual({ hits: 3 });
    now += 2000;
    expect(await c.get('research-results', 'q1')).toBeNull();
    expect((await c.get('research-results', 'q1', { allowStale: true }))?.stale).toBe(true);
  });

  it('cascades invalidation through dependencies', async () => {
    const c = make();
    await c.set('reference-metadata', 'ref-a', { title: 'A' }, { source: 'fetch', dependencies: ['url:https://a.example'] });
    await c.set('visual-analysis', 'ana-a', { ok: true }, { source: 'agent', dependencies: ['reference-metadata:ref-a'] });
    await c.set('visual-analysis', 'ana-b', { ok: true }, { source: 'agent', dependencies: ['url:https://b.example'] });
    const n = await c.invalidateByDependency('url:https://a.example');
    expect(n).toBe(2);
    expect(await c.get('visual-analysis', 'ana-a')).toBeNull();
    expect(await c.get('visual-analysis', 'ana-b')).not.toBeNull();
  });

  it('treats a tampered payload as a miss', async () => {
    const c = make();
    const e = await c.set('agent-temp', 'k', { v: 1 }, { source: 't' });
    writeFileSync(c.pathOf(e), '{"v":2}');
    expect(await c.get('agent-temp', 'k')).toBeNull();
  });

  it('getOrCompute only computes on a miss, and content versions invalidate', async () => {
    const c = make();
    let calls = 0;
    const compute = async () => ++calls;
    await c.getOrCompute('agent-temp', 'x', compute, { source: 't' });
    const second = await c.getOrCompute('agent-temp', 'x', compute, { source: 't' });
    expect(second).toEqual({ value: 1, cached: true });
    await c.set('agent-temp', 'y', 'v1', { source: 't', contentVersion: 1 });
    expect(await c.get('agent-temp', 'y', { contentVersion: 2 })).toBeNull();
  });
});
