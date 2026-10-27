import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SkillRegistry } from '@ui-ux-magec/skill-registry';
import { AgentRegistry } from '@ui-ux-magec/agent-core';
import { MagecRuntime } from '@ui-ux-magec/runtime';

const root = process.env.MAGEC_REPO_ROOT!;
const skills = SkillRegistry.discover([join(root, 'skills')]);
const agents = AgentRegistry.load(join(root, 'agents'), skills);

describe('agent registration', () => {
  it('registers the orchestrator and all eleven specialists without issues', () => {
    expect(agents.issues).toEqual([]);
    expect(agents.ids().sort()).toEqual(['asset-agent', 'brand-identity-agent', 'creative-director', 'design-qa-agent', 'design-system-agent', 'figma-designer', 'master-orchestrator', 'product-analyst', 'research-agent', 'ux-audit-agent', 'visual-analysis-agent', 'workspace-manager']);
    expect(agents.list().filter((a) => a.definition.kind === 'orchestrator').map((a) => a.definition.id)).toEqual(['master-orchestrator']);
    for (const a of agents.list()) expect(a.instructions.length, a.definition.id).toBeGreaterThan(500);
  });

  it('every task type has exactly one owning agent', () => {
    const owners = new Map<string, string[]>();
    for (const a of agents.list()) for (const t of a.definition.taskTypes) owners.set(t, [...(owners.get(t) ?? []), a.definition.id]);
    for (const [type, list] of owners) expect(list, type).toHaveLength(1);
    expect(agents.agentForTaskType('figma-page-design')).toBe('figma-designer');
  });

  it('only the figma designer may write to Figma', () => {
    const writers = agents.list().filter((a) => a.definition.permissions.includes('figma.write')).map((a) => a.definition.id);
    expect(writers).toEqual(['figma-designer']);
  });
});

describe('skill discovery', () => {
  it('discovers shared and specialized skills with all required sections', () => {
    expect(skills.list({ category: 'shared' }).length).toBeGreaterThanOrEqual(15);
    expect(skills.list({ category: 'specialized' }).length).toBeGreaterThanOrEqual(60);
    expect(skills.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(skills.issues).toEqual([]);
  });

  it('skills only reference tools and agents that exist', async () => {
    const rt = await MagecRuntime.create({ projectDir: root, stderr: false });
    const issues = rt.skills.validate(new Set(rt.tools.list().map((t) => t.name)), new Set(rt.agents.ids()));
    expect(issues).toEqual([]);
    await rt.close();
  });

  it('loads skill bodies on demand (metadata first)', () => {
    const meta = skills.get('figma-auto-layout')!;
    expect(meta.description.length).toBeGreaterThan(10);
    const loaded = skills.load('figma-auto-layout');
    expect(loaded.body).toMatch(/## Instructions/);
  });
});

describe('shared skill resolution (scenario G)', () => {
  it('two specialists resolve the same shared skill definition, without duplication', () => {
    const a = skills.resolveForAgent(agents.require('research-agent').definition);
    const b = skills.resolveForAgent(agents.require('figma-designer').definition);
    const ca = a.shared.find((s) => s.name === 'context-management')!;
    const cb = b.shared.find((s) => s.name === 'context-management')!;
    expect(ca.dir).toBe(cb.dir);
    expect(skills.list().filter((s) => s.name === 'context-management')).toHaveLength(1);
  });

  it("an agent cannot claim another agent's specialized skill", () => {
    const def = { ...agents.require('research-agent').definition, skills: { shared: [], specialized: ['figma-auto-layout'] } };
    expect(skills.resolveForAgent(def).notOwned).toEqual(['figma-auto-layout']);
  });
});
