import { open, readFile, rm, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './fs.js';

export interface LockInfo {
  scope: string;
  owner: string;
  pid: number;
  host: string;
  acquiredAt: string;
  expiresAt: string;
}

export class LockHeldError extends Error {
  constructor(public readonly scope: string, public readonly holder: LockInfo) {
    super(`scope "${scope}" is locked by ${holder.owner} (pid ${holder.pid}) until ${holder.expiresAt}`);
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Per-lock-file promise chains that serialize callers within this process. */
const inProcessQueues = new Map<string, Promise<void>>();

/**
 * Cross-process advisory locks backed by `open(path, 'wx')`, which is atomic on local filesystems.
 * A lock is stale when it has expired or its owning process on this host is gone.
 */
export class FileLockManager {
  constructor(private readonly dir: string, private readonly host = process.env.HOSTNAME ?? 'local') {}

  private pathFor(scope: string): string {
    const safe = scope.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60);
    return join(this.dir, `${safe}-${sha256(scope).slice(0, 10)}.lock`);
  }

  async read(scope: string): Promise<LockInfo | null> {
    try {
      return JSON.parse(await readFile(this.pathFor(scope), 'utf8')) as LockInfo;
    } catch {
      return null;
    }
  }

  isStale(info: LockInfo): boolean {
    if (Date.parse(info.expiresAt) < Date.now()) return true;
    return info.host === this.host && !pidAlive(info.pid);
  }

  async acquire(scope: string, owner: string, ttlMs = 10 * 60_000): Promise<LockInfo> {
    await mkdir(this.dir, { recursive: true });
    const path = this.pathFor(scope);
    for (let attempt = 0; attempt < 2; attempt++) {
      const info: LockInfo = {
        scope, owner, pid: process.pid, host: this.host,
        acquiredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      };
      try {
        const handle = await open(path, 'wx');
        await handle.writeFile(JSON.stringify(info));
        await handle.close();
        return info;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        const holder = await this.read(scope);
        if (holder && holder.owner === owner && holder.pid === process.pid) return holder;
        if (holder && !this.isStale(holder)) throw new LockHeldError(scope, holder);
        await rm(path, { force: true });
      }
    }
    const holder = await this.read(scope);
    throw new LockHeldError(scope, holder ?? ({ scope, owner: 'unknown', pid: 0, host: '', acquiredAt: '', expiresAt: '' } as LockInfo));
  }

  async release(scope: string, owner: string): Promise<boolean> {
    const holder = await this.read(scope);
    if (!holder || holder.owner !== owner) return false;
    await rm(this.pathFor(scope), { force: true });
    return true;
  }

  /**
   * Runs `fn` holding the lock, retrying acquisition for up to `waitMs`. Callers in the same process are
   * queued first: the file lock alone is re-entrant for one owner and would let concurrent async callers
   * of this process interleave their read-modify-write cycles.
   */
  async withLock<T>(scope: string, owner: string, fn: () => Promise<T>, opts: { ttlMs?: number; waitMs?: number } = {}): Promise<T> {
    const key = this.pathFor(scope);
    const previous = inProcessQueues.get(key) ?? Promise.resolve();
    let releaseQueue!: () => void;
    const mine = new Promise<void>((r) => (releaseQueue = r));
    const tail = previous.then(() => mine);
    inProcessQueues.set(key, tail);
    await previous;
    try {
      return await this.withFileLock(scope, owner, fn, opts);
    } finally {
      releaseQueue();
      if (inProcessQueues.get(key) === tail) inProcessQueues.delete(key);
    }
  }

  private async withFileLock<T>(scope: string, owner: string, fn: () => Promise<T>, opts: { ttlMs?: number; waitMs?: number }): Promise<T> {
    const deadline = Date.now() + (opts.waitMs ?? 5000);
    for (;;) {
      try {
        await this.acquire(scope, owner, opts.ttlMs);
        break;
      } catch (err) {
        if (!(err instanceof LockHeldError) || Date.now() > deadline) throw err;
        await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
      }
    }
    try {
      return await fn();
    } finally {
      await this.release(scope, owner);
    }
  }

  async list(): Promise<Array<LockInfo & { stale: boolean }>> {
    let files: string[] = [];
    try {
      files = (await readdir(this.dir)).filter((f) => f.endsWith('.lock'));
    } catch {
      return [];
    }
    const out: Array<LockInfo & { stale: boolean }> = [];
    for (const f of files) {
      try {
        const info = JSON.parse(await readFile(join(this.dir, f), 'utf8')) as LockInfo;
        out.push({ ...info, stale: this.isStale(info) });
      } catch {
        // unreadable lock files are reported by workspace validation
      }
    }
    return out;
  }

  async clearStale(): Promise<string[]> {
    const cleared: string[] = [];
    for (const l of await this.list()) {
      if (l.stale) {
        await rm(this.pathFor(l.scope), { force: true });
        cleared.push(l.scope);
      }
    }
    return cleared;
  }
}
