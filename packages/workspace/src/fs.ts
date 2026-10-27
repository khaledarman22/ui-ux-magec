import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { z } from 'zod';

export { sha256, stableStringify, hashJson } from '@ui-ux-magec/schemas';

export class PathEscapeError extends Error {
  constructor(public readonly requested: string) {
    super(`path escapes its root: ${requested}`);
  }
}

/** Joins `rel` under `root`, refusing absolute paths and `..` traversal. */
export function safeJoin(root: string, rel: string): string {
  if (isAbsolute(rel)) throw new PathEscapeError(rel);
  const full = resolve(root, rel);
  const back = relative(root, full);
  if (back === '' || back.startsWith('..') || isAbsolute(back) || back.split(sep).includes('..')) throw new PathEscapeError(rel);
  return full;
}

/** Write via temp file + fsync + rename so readers never observe a half-written file. */
export async function atomicWriteFile(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWriteFile(path, JSON.stringify(value, null, 2) + '\n');
}

export class JsonFileError extends Error {
  constructor(public readonly path: string, message: string, public readonly issues?: unknown) {
    super(`${path}: ${message}`);
  }
}

export async function readJson<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    throw new JsonFileError(path, `cannot read (${(err as NodeJS.ErrnoException).code ?? 'error'})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JsonFileError(path, 'invalid JSON');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new JsonFileError(path, `schema validation failed: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, result.error.issues);
  return result.data;
}

export async function readJsonOr<S extends z.ZodType>(path: string, schema: S, fallback: z.infer<S>): Promise<z.infer<S>> {
  if (!existsSync(path)) return fallback;
  return readJson(path, schema);
}

export async function appendJsonl(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(value) + '\n');
}

export interface JsonlReadResult<T> {
  records: T[];
  /** Lines that failed to parse or validate (e.g. a line truncated by a crash). */
  invalidLines: number[];
}

export async function readJsonl<S extends z.ZodType>(path: string, schema: S): Promise<JsonlReadResult<z.infer<S>>> {
  if (!existsSync(path)) return { records: [], invalidLines: [] };
  const raw = await readFile(path, 'utf8');
  const records: z.infer<S>[] = [];
  const invalidLines: number[] = [];
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const r = schema.safeParse(JSON.parse(line));
      if (r.success) records.push(r.data);
      else invalidLines.push(i + 1);
    } catch {
      invalidLines.push(i + 1);
    }
  });
  return { records, invalidLines };
}

export function readTextSync(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeFileIfAbsent(path: string, data: string): Promise<boolean> {
  if (existsSync(path)) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data, { flag: 'wx' }).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'EEXIST') throw err;
  });
  return true;
}
