import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Workspace } from '@ui-ux-magec/workspace';
import { TaskStore, DependencyCycleError, topologicalOrder } from '@ui-ux-magec/task-manager';
import { sandbox } from '../helpers/env.js';

let env: ReturnType<typeof sandbox>;
let ws: Workspace;
let store: TaskStore;

beforeEach(async () => {
  env = sandbox();
  ws = await Workspace.init(env.dir, { name: 'Tasks' });
  store = new TaskStore(ws);
});
afterEach(() => env.cleanup());

const t = (key: string, deps: string[] = [], extra: Record<string, unknown> = {}) => ({ idempotencyKey: key, agent: 'product-analyst', type: 'product-analysis' as const, title: key, dependencies: deps, ...extra });

describe('task dependency ordering', () => {
  it('only tasks whose dependencies completed become ready, in dependency order', async () => {
    const [a, b, c] = await store.create([t('a'), t('b', ['a']), t('c', ['a', 'b'])]);
    expect(a!.status).toBe('ready');
    expect(b!.status).toBe('pending');
    expect(c!.status).toBe('pending');
    expect((await store.ready()).map((x) => x.idempotencyKey)).toEqual(['a']);
    await store.claim(a!.taskId, 'test');
    await store.complete(a!.taskId, { outputRefs: [], validation: { ok: true, errors: [], warnings: [], checkedAt: new Date().toISOString() } });
    expect((await store.ready()).map((x) => x.idempotencyKey)).toEqual(['b']);
    expect(topologicalOrder(await store.list())).toEqual([a!.taskId, b!.taskId, c!.taskId]);
  });

  it('rejects dependency cycles', async () => {
    const [a] = await store.create([t('a')]);
    const [b] = await store.create([t('b', [a!.taskId])]);
    await expect(store.addDependency(a!.taskId, b!.taskId)).rejects.toBeInstanceOf(DependencyCycleError);
  });

  it('never schedules two tasks with overlapping scopes at once', async () => {
    await store.create([t('p1', [], { scope: 'figma:page:home' }), t('p2', [], { scope: 'figma:page:home' }), t('p3', [], { scope: 'figma:page:about' })]);
    const batch = await store.schedule(5);
    expect(batch.map((x) => x.idempotencyKey).sort()).toEqual(['p1', 'p3']);
  });
});

describe('task status persistence', () => {
  it('persists status, attempts and errors across store instances', async () => {
    const [a] = await store.create([t('a', [], { maxAttempts: 2 })]);
    await store.claim(a!.taskId, 'agent');
    await store.fail(a!.taskId, { message: 'network down', kind: 'technical', retryable: true });
    const reopened = new TaskStore(await Workspace.open(env.dir));
    const again = await reopened.get(a!.taskId);
    expect(again.status).toBe('ready');
    expect(again.attempt).toBe(1);
    expect(again.errors[0]!.message).toBe('network down');
    await reopened.claim(a!.taskId, 'agent');
    const failed = await reopened.fail(a!.taskId, { message: 'still down', kind: 'technical', retryable: true });
    expect(failed.status).toBe('failed');
  });

  it('creating the same workflow twice does not duplicate tasks', async () => {
    const first = await store.create([t('a'), t('b', ['a'])]);
    const second = await store.create([t('a'), t('b', ['a'])]);
    expect(second.map((x) => x.taskId)).toEqual(first.map((x) => x.taskId));
    expect((await store.list()).length).toBe(2);
  });

  it('recovers tasks interrupted while running and refunds the attempt', async () => {
    const [a] = await store.create([t('a')]);
    await store.claim(a!.taskId, 'agent');
    const recovered = await store.recoverInterrupted({ olderThanMs: 0 });
    expect(recovered.map((x) => x.taskId)).toEqual([a!.taskId]);
    const after = await store.get(a!.taskId);
    expect(after.status).toBe('ready');
    expect(after.attempt).toBe(0);
  });

  it('supersedes dependents transitively', async () => {
    const [a, b] = await store.create([t('a'), t('b', ['a'])]);
    await store.supersede([a!.taskId]);
    expect((await store.get(b!.taskId)).status).toBe('superseded');
  });

  it('rejects illegal transitions', async () => {
    const [a] = await store.create([t('a')]);
    await expect(store.transition(a!.taskId, 'completed')).rejects.toThrow(/illegal transition/);
  });
});
