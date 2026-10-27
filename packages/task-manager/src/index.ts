import { join } from 'node:path';
import {
  AgentMessageSchema, ID_PREFIX, NewTaskSchema, TERMINAL_STATUSES, TaskSchema, newId, nowIso, z,
  type AgentMessage, type NewTask, type Task, type TaskError, type TaskStatus,
} from '@ui-ux-magec/schemas';
import { FileLockManager, LockHeldError, appendJsonl, readJsonl, readJsonOr, writeJson, type Workspace } from '@ui-ux-magec/workspace';
import { silentLogger, type Logger } from '@ui-ux-magec/logger';

const TaskFileSchema = z.object({ version: z.literal(1), tasks: z.array(TaskSchema) });

/** Allowed status transitions. Anything else is a programming error and is rejected. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['ready', 'blocked', 'cancelled', 'superseded', 'waiting_for_approval'],
  ready: ['running', 'pending', 'blocked', 'cancelled', 'superseded', 'waiting_for_approval'],
  running: ['completed', 'failed', 'ready', 'blocked', 'waiting_for_approval', 'cancelled', 'superseded'],
  blocked: ['ready', 'pending', 'cancelled', 'superseded', 'failed'],
  waiting_for_approval: ['ready', 'completed', 'cancelled', 'superseded', 'blocked'],
  completed: ['superseded'],
  failed: ['ready', 'superseded', 'cancelled'],
  cancelled: ['superseded'],
  superseded: [],
};

export class TaskTransitionError extends Error {
  constructor(public readonly taskId: string, from: TaskStatus, to: TaskStatus) {
    super(`task ${taskId}: illegal transition ${from} -> ${to}`);
  }
}
export class TaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`task ${taskId} not found`);
  }
}
export class DependencyCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`dependency cycle: ${cycle.join(' -> ')}`);
  }
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Persistent task store. The whole graph is kept in tasks/tasks.json and every mutation is a
 * read-modify-write under a cross-process lock, so the CLI and the MCP server can work on the same project.
 */
export class TaskStore {
  private readonly file: string;
  private readonly messagesFile: string;
  private readonly locks: FileLockManager;
  constructor(private readonly ws: Workspace, private readonly log: Logger = silentLogger) {
    this.file = ws.resolve('tasks/tasks.json');
    this.messagesFile = ws.resolve('tasks/messages.jsonl');
    this.locks = ws.locks;
  }

  async list(filter: { status?: TaskStatus[]; agent?: string; type?: string; workflowId?: string } = {}): Promise<Task[]> {
    const { tasks } = await readJsonOr(this.file, TaskFileSchema, { version: 1, tasks: [] });
    return tasks.filter((t) =>
      (!filter.status || filter.status.includes(t.status)) &&
      (!filter.agent || t.agent === filter.agent) &&
      (!filter.type || t.type === filter.type) &&
      (!filter.workflowId || t.workflowId === filter.workflowId));
  }

  async get(taskId: string): Promise<Task> {
    const t = (await this.list()).find((x) => x.taskId === taskId);
    if (!t) throw new TaskNotFoundError(taskId);
    return t;
  }

  async find(taskId: string): Promise<Task | null> {
    return (await this.list()).find((x) => x.taskId === taskId) ?? null;
  }

  private async mutate<T>(fn: (tasks: Task[]) => T): Promise<T> {
    return this.locks.withLock('state:tasks', `pid-${process.pid}`, async () => {
      const data = await readJsonOr(this.file, TaskFileSchema, { version: 1, tasks: [] });
      const result = fn(data.tasks);
      await writeJson(this.file, { version: 1, tasks: data.tasks.map((t) => TaskSchema.parse(t)) });
      return result;
    }, { waitMs: 15_000 });
  }

  /**
   * Creates tasks idempotently: a task whose idempotencyKey matches a live (non-superseded, non-cancelled)
   * task returns the existing one instead of duplicating work. Dependencies may reference ids or keys.
   */
  async create(inputs: NewTask[]): Promise<Task[]> {
    const project = this.ws.getProject();
    return this.mutate((tasks) => {
      const created: Task[] = [];
      const byKey = new Map(tasks.filter((t) => t.status !== 'superseded' && t.status !== 'cancelled').map((t) => [t.idempotencyKey, t]));
      for (const raw of inputs) {
        const input = NewTaskSchema.parse(raw);
        const existing = byKey.get(input.idempotencyKey);
        if (existing) {
          created.push(existing);
          continue;
        }
        const deps = (input.dependencies ?? []).map((d) => byKey.get(d)?.taskId ?? d);
        for (const d of deps) if (!tasks.some((t) => t.taskId === d)) throw new TaskNotFoundError(d);
        const now = nowIso();
        const task = TaskSchema.parse({
          ...input,
          dependencies: deps,
          taskId: newId(ID_PREFIX.task),
          projectId: project.projectId,
          status: 'pending',
          attempt: 0,
          maxAttempts: input.maxAttempts ?? project.settings.maxTaskAttempts,
          createdAt: now,
          updatedAt: now,
        });
        tasks.push(task);
        byKey.set(task.idempotencyKey, task);
        created.push(task);
      }
      assertAcyclic(tasks);
      refreshReadiness(tasks);
      return created.map((c) => tasks.find((t) => t.taskId === c.taskId)!);
    });
  }

  async transition(taskId: string, to: TaskStatus, patch: Partial<Task> = {}): Promise<Task> {
    return this.mutate((tasks) => {
      const t = tasks.find((x) => x.taskId === taskId);
      if (!t) throw new TaskNotFoundError(taskId);
      if (t.status !== to && !TRANSITIONS[t.status].includes(to)) throw new TaskTransitionError(taskId, t.status, to);
      Object.assign(t, patch, { status: to, updatedAt: nowIso() });
      if (to === 'completed') t.completedAt = t.updatedAt;
      refreshReadiness(tasks);
      this.log.debug('task transition', { taskId, to });
      return { ...t };
    });
  }

  /** Atomically moves a ready task to running and increments its attempt counter. */
  async claim(taskId: string, claimedBy: string): Promise<Task> {
    return this.mutate((tasks) => {
      const t = tasks.find((x) => x.taskId === taskId);
      if (!t) throw new TaskNotFoundError(taskId);
      if (t.status !== 'ready') throw new TaskTransitionError(taskId, t.status, 'running');
      if (t.scope) {
        const conflict = tasks.find((o) => o.taskId !== t.taskId && o.status === 'running' && o.scope && scopesOverlap(o.scope, t.scope!));
        if (conflict) throw new ScopeConflictError(t.scope, conflict.taskId);
      }
      t.status = 'running';
      t.attempt += 1;
      t.claimedBy = claimedBy;
      t.startedAt = nowIso();
      t.updatedAt = t.startedAt;
      return { ...t };
    });
  }

  async complete(taskId: string, result: { outputRefs: string[]; validation: Task['validation'] }): Promise<Task> {
    return this.transition(taskId, 'completed', { outputRefs: result.outputRefs, validation: result.validation });
  }

  /** Records an error. Retryable technical failures go back to `ready` until maxAttempts is reached. */
  async fail(taskId: string, error: Omit<TaskError, 'at' | 'attempt'>): Promise<Task> {
    return this.mutate((tasks) => {
      const t = tasks.find((x) => x.taskId === taskId);
      if (!t) throw new TaskNotFoundError(taskId);
      if (t.status !== 'running' && t.status !== 'ready' && t.status !== 'blocked') throw new TaskTransitionError(taskId, t.status, 'failed');
      t.errors.push({ ...error, at: nowIso(), attempt: t.attempt });
      const retry = error.retryable && t.attempt < t.maxAttempts;
      t.status = retry ? 'ready' : 'failed';
      t.updatedAt = nowIso();
      refreshReadiness(tasks);
      return { ...t };
    });
  }

  /** Marks tasks (and, transitively, their non-terminal dependents) as superseded by a replacement. */
  async supersede(taskIds: string[], supersededBy?: string): Promise<Task[]> {
    return this.mutate((tasks) => {
      const out: Task[] = [];
      const queue = [...taskIds];
      const seen = new Set<string>();
      while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const t = tasks.find((x) => x.taskId === id);
        if (!t || t.status === 'superseded') continue;
        t.status = 'superseded';
        if (supersededBy) t.supersededBy = supersededBy;
        t.updatedAt = nowIso();
        out.push({ ...t });
        for (const dep of tasks) if (dep.dependencies.includes(id) && !isTerminal(dep.status)) queue.push(dep.taskId);
      }
      refreshReadiness(tasks);
      return out;
    });
  }

  async update(taskId: string, patch: Partial<Pick<Task, 'params' | 'description' | 'priority' | 'inputRefs'>>): Promise<Task> {
    return this.mutate((tasks) => {
      const t = tasks.find((x) => x.taskId === taskId);
      if (!t) throw new TaskNotFoundError(taskId);
      Object.assign(t, patch, { updatedAt: nowIso() });
      return { ...t };
    });
  }

  async addDependency(taskId: string, dependsOn: string): Promise<void> {
    await this.mutate((tasks) => {
      const t = tasks.find((x) => x.taskId === taskId);
      if (!t) throw new TaskNotFoundError(taskId);
      if (!tasks.some((x) => x.taskId === dependsOn)) throw new TaskNotFoundError(dependsOn);
      if (!t.dependencies.includes(dependsOn)) t.dependencies.push(dependsOn);
      if (t.status === 'ready') t.status = 'pending';
      assertAcyclic(tasks);
      refreshReadiness(tasks);
    });
  }

  /**
   * Tasks left `running` by a crashed or closed session. They are returned to `ready` without consuming an
   * attempt unless the caller determines the work partially happened (e.g. a pending Figma operation).
   */
  async recoverInterrupted(opts: { olderThanMs?: number; exclude?: string[] } = {}): Promise<Task[]> {
    const cutoff = Date.now() - (opts.olderThanMs ?? 0);
    return this.mutate((tasks) => {
      const out: Task[] = [];
      for (const t of tasks) {
        if (t.status !== 'running' || opts.exclude?.includes(t.taskId)) continue;
        if (Date.parse(t.startedAt ?? t.updatedAt) > cutoff) continue;
        t.status = 'ready';
        t.attempt = Math.max(0, t.attempt - 1);
        t.errors.push({ message: 'interrupted: session ended while task was running', kind: 'technical', retryable: true, at: nowIso(), attempt: t.attempt + 1 });
        t.updatedAt = nowIso();
        out.push({ ...t });
      }
      refreshReadiness(tasks);
      return out;
    });
  }

  /** Ready tasks in scheduling order (priority desc, then creation order). */
  async ready(filter: { agent?: string } = {}): Promise<Task[]> {
    const tasks = await this.list({ status: ['ready'], ...(filter.agent ? { agent: filter.agent } : {}) });
    return tasks.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Picks a batch of ready tasks that can run concurrently: no two share an overlapping lock scope, and none
   * overlaps a task already running.
   */
  async schedule(limit: number): Promise<Task[]> {
    const all = await this.list();
    const running = all.filter((t) => t.status === 'running');
    const ready = all.filter((t) => t.status === 'ready').sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
    const picked: Task[] = [];
    const busy = running.map((t) => t.scope).filter((s): s is string => !!s);
    for (const t of ready) {
      if (picked.length + running.length >= limit) break;
      if (t.scope && busy.some((s) => scopesOverlap(s, t.scope!))) continue;
      picked.push(t);
      if (t.scope) busy.push(t.scope);
    }
    return picked;
  }

  async summary(): Promise<Record<TaskStatus, number> & { total: number }> {
    const tasks = await this.list();
    const out = { total: tasks.length } as Record<TaskStatus, number> & { total: number };
    for (const s of TaskSchema.shape.status.options) out[s] = 0;
    for (const t of tasks) out[t.status]++;
    return out;
  }

  /* ---------- Inter-agent messages ---------- */

  async sendMessage(msg: Omit<AgentMessage, 'messageId' | 'projectId' | 'createdAt' | 'artifactRefs'> & { artifactRefs?: string[] }): Promise<AgentMessage> {
    const m = AgentMessageSchema.parse({ ...msg, messageId: newId(ID_PREFIX.message), projectId: this.ws.projectId, createdAt: nowIso() });
    await appendJsonl(this.messagesFile, m);
    return m;
  }

  async messages(filter: { to?: string; taskId?: string } = {}): Promise<AgentMessage[]> {
    const { records } = await readJsonl(this.messagesFile, AgentMessageSchema);
    return records.filter((m) => (!filter.to || m.to === filter.to) && (!filter.taskId || m.taskId === filter.taskId));
  }

  /** Low-level access for lock acquisition by scope (Figma writes). */
  get lockManager(): FileLockManager {
    return this.locks;
  }

  static isLockHeld(err: unknown): err is LockHeldError {
    return err instanceof LockHeldError;
  }

  static file(ws: Workspace): string {
    return join(ws.dir, 'tasks', 'tasks.json');
  }
}

export class ScopeConflictError extends Error {
  constructor(public readonly scope: string, public readonly heldByTask: string) {
    super(`scope "${scope}" is in use by running task ${heldByTask}`);
  }
}

/** `figma:file` overlaps `figma:file:page:home`; siblings like `figma:page:home` and `figma:page:about` do not. */
export function scopesOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  return a.startsWith(`${b}:`) || b.startsWith(`${a}:`);
}

/** Recomputes pending/ready/blocked for non-terminal tasks from their dependencies. */
export function refreshReadiness(tasks: Task[]): void {
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  for (const t of tasks) {
    if (!['pending', 'ready', 'blocked'].includes(t.status)) continue;
    const deps = t.dependencies.map((d) => byId.get(d));
    const failed = deps.some((d) => !d || d.status === 'failed' || d.status === 'cancelled');
    const supersededDep = deps.some((d) => d?.status === 'superseded');
    const done = deps.every((d) => d?.status === 'completed');
    const next: TaskStatus = failed || supersededDep ? 'blocked' : done ? 'ready' : 'pending';
    if (next !== t.status) {
      t.status = next;
      t.updatedAt = nowIso();
    }
  }
}

export function assertAcyclic(tasks: Task[]): void {
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    const s = state.get(id);
    if (s === 2) return;
    if (s === 1) throw new DependencyCycleError([...stack.slice(stack.indexOf(id)), id]);
    state.set(id, 1);
    stack.push(id);
    for (const d of byId.get(id)?.dependencies ?? []) visit(d);
    stack.pop();
    state.set(id, 2);
  };
  for (const t of tasks) visit(t.taskId);
}

/** Kahn topological order (useful for display and tests). */
export function topologicalOrder(tasks: Task[]): string[] {
  const indeg = new Map(tasks.map((t) => [t.taskId, 0]));
  for (const t of tasks) for (const d of t.dependencies) if (indeg.has(d)) indeg.set(t.taskId, (indeg.get(t.taskId) ?? 0) + 1);
  const queue = tasks.filter((t) => indeg.get(t.taskId) === 0).map((t) => t.taskId);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const t of tasks) {
      if (!t.dependencies.includes(id)) continue;
      const n = (indeg.get(t.taskId) ?? 0) - 1;
      indeg.set(t.taskId, n);
      if (n === 0) queue.push(t.taskId);
    }
  }
  return out;
}
