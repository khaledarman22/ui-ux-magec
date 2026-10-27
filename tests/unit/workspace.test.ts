import { existsSync, readdirSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Workspace, WorkspaceExistsError, WORKSPACE_SUBDIRS, ASSET_SUBDIRS, PathEscapeError, findWorkspaceRoot } from '@ui-ux-magec/workspace';
import { GlobalKnowledge, ProjectMemory } from '@ui-ux-magec/memory';
import { sandbox } from '../helpers/env.js';

let env: ReturnType<typeof sandbox>;
beforeEach(() => (env = sandbox()));
afterEach(() => env.cleanup());

describe('workspace initialization', () => {
  it('creates the full layout, a README and a new project id', async () => {
    const ws = await Workspace.init(env.dir, { name: 'Acme Agency', brief: 'Premium agency site', languages: ['en', 'ar'] });
    for (const sub of WORKSPACE_SUBDIRS) expect(existsSync(join(ws.dir, sub)), sub).toBe(true);
    for (const sub of ASSET_SUBDIRS) expect(existsSync(join(env.dir, sub)), sub).toBe(true);
    expect(existsSync(join(env.dir, 'README.md'))).toBe(true);
    expect(ws.projectId).toMatch(/^prj_/);
    expect(ws.getProject().direction).toBe('both');
    expect(findWorkspaceRoot(join(env.dir, 'assets'))).toBe(env.dir);
  });

  it('refuses to initialize over an existing workspace', async () => {
    await Workspace.init(env.dir, { name: 'A' });
    await expect(Workspace.init(env.dir, { name: 'B' })).rejects.toBeInstanceOf(WorkspaceExistsError);
  });

  it('confines artifact writes to the workspace areas', async () => {
    const ws = await Workspace.init(env.dir, { name: 'A' });
    await expect(ws.writeArtifact('../../escape.txt', 'x', { kind: 'other', producedBy: 't' })).rejects.toThrow();
    expect(() => ws.resolve('../../etc/passwd')).toThrow(PathEscapeError);
    await expect(ws.writeArtifact('logs/x.json', {}, { kind: 'other', producedBy: 't' })).rejects.toThrow();
    const r = await ws.writeArtifact('planning/notes.md', 'hello', { kind: 'other', producedBy: 't' });
    expect(r.path).toBe('planning/notes.md');
    expect((await ws.getManifest()).artifacts['planning/notes.md']!.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('workspace resume', () => {
  it('detects and repairs interruption leftovers without touching project data', async () => {
    const ws = await Workspace.init(env.dir, { name: 'A' });
    await ws.writeArtifact('planning/notes.md', 'v1', { kind: 'other', producedBy: 't' });
    // Simulate a crash: stale lock from a dead process, orphaned temp file, deleted directory, edited artifact.
    await ws.locks.acquire('figma:demo', 'crashed-session', 1);
    await new Promise((r) => setTimeout(r, 5));
    const tmp = join(ws.dir, 'planning', 'x.json.1234.tmp');
    writeFileSync(tmp, '{');
    utimesSync(tmp, new Date(Date.now() - 120_000), new Date(Date.now() - 120_000));
    writeFileSync(join(ws.dir, 'planning', 'notes.md'), 'edited by hand');
    const reopened = await Workspace.open(env.dir);
    const v = await reopened.validate();
    expect(v.ok).toBe(true);
    expect(v.warnings.join('\n')).toMatch(/modified outside the runtime/);
    const repairs = await reopened.repair();
    expect(repairs.join('\n')).toMatch(/temp file/);
    expect(repairs.join('\n')).toMatch(/stale lock figma:demo/);
    expect(existsSync(tmp)).toBe(false);
    expect(await reopened.readArtifact('planning/notes.md')).toBe('edited by hand');
  });

  it('reports a corrupted project file instead of silently recreating it', async () => {
    const ws = await Workspace.init(env.dir, { name: 'A' });
    writeFileSync(join(ws.dir, 'state.json'), '{not json');
    const v = await ws.validate();
    expect(v.ok).toBe(false);
  });

  it('checkpoints capture state files and are listed newest first', async () => {
    const ws = await Workspace.init(env.dir, { name: 'A' });
    const c1 = await ws.createCheckpoint('requirements', 'Requirements', []);
    const c2 = await ws.createCheckpoint('research', 'Research', []);
    expect((await ws.latestValidCheckpoint())!.checkpointId).toBe(c2.checkpointId);
    expect((await ws.listCheckpoints()).map((c) => c.checkpointId)).toContain(c1.checkpointId);
  });
});

describe('deleted project handling', () => {
  it('deletion is permanent, keeps no global copy, and a new init is a new independent project', async () => {
    const ws = await Workspace.init(env.dir, { name: 'Experiment', brief: 'secret client brief' });
    const memory = new ProjectMemory(ws);
    await memory.recordDecision({ topic: 'concept:project', decision: 'Bold editorial', rationale: 'x', status: 'accepted', scope: 'project', source: 'user' });
    const oldId = ws.projectId;
    await ws.destroy({ includeAssets: true });
    expect(existsSync(join(env.dir, '.ui-ux-magec'))).toBe(false);
    expect(existsSync(join(env.dir, 'assets'))).toBe(false);
    // Nothing project-specific in the global home.
    const homeFiles = existsSync(env.home) ? readdirSync(env.home, { recursive: true }).map(String) : [];
    expect(homeFiles.filter((f) => !['config.json', 'knowledge.json'].includes(f))).toEqual([]);
    const k = await new GlobalKnowledge(env.home).read();
    expect(JSON.stringify(k)).not.toContain('secret client brief');
    expect(JSON.stringify(k)).not.toContain(oldId);
    await expect(Workspace.open(env.dir)).rejects.toThrow();
    const fresh = await Workspace.init(env.dir, { name: 'Experiment' });
    expect(fresh.projectId).not.toBe(oldId);
    expect(await new ProjectMemory(fresh).listDecisions()).toEqual([]);
  });

  it('global knowledge stores only explicit preferences, and usage only when enabled', async () => {
    mkdirSync(env.home, { recursive: true });
    const k = new GlobalKnowledge(env.home);
    await k.recordReferenceUsage(['https://dribbble.com/shots/1']);
    expect((await k.read()).referenceUsage).toEqual({});
    await k.setReferenceUsageEnabled(true);
    await k.recordReferenceUsage(['https://dribbble.com/shots/1']);
    expect((await k.read()).referenceUsage['https://dribbble.com/shots/1']).toBe(1);
  });
});
