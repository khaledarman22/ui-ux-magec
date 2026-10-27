import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AgentDefinitionSchema, type AgentDefinition, type Permission } from '@ui-ux-magec/schemas';
import type { SkillRegistry } from '@ui-ux-magec/skill-registry';

export interface RegisteredAgent {
  definition: AgentDefinition;
  /** Operating instructions (AGENT.md). */
  instructions: string;
  dir: string;
}

export interface AgentIssue {
  agent: string;
  level: 'error' | 'warning';
  message: string;
}

/** Loads agents from `<root>/<id>/agent.json` + `AGENT.md` and validates them against the skill registry. */
export class AgentRegistry {
  private readonly agents = new Map<string, RegisteredAgent>();
  readonly issues: AgentIssue[] = [];

  static load(root: string, skills?: SkillRegistry): AgentRegistry {
    const reg = new AgentRegistry();
    if (!existsSync(root)) throw new Error(`agents directory not found: ${root}`);
    for (const id of readdirSync(root).sort()) {
      const dir = join(root, id);
      if (!statSync(dir).isDirectory()) continue;
      const defFile = join(dir, 'agent.json');
      if (!existsSync(defFile)) continue;
      try {
        const definition = AgentDefinitionSchema.parse(JSON.parse(readFileSync(defFile, 'utf8')));
        if (definition.id !== id) reg.issues.push({ agent: id, level: 'error', message: `id "${definition.id}" does not match directory` });
        const mdFile = join(dir, 'AGENT.md');
        const instructions = existsSync(mdFile) ? readFileSync(mdFile, 'utf8') : '';
        if (!instructions.trim()) reg.issues.push({ agent: id, level: 'error', message: 'missing AGENT.md instructions' });
        reg.register({ definition, instructions, dir });
      } catch (err) {
        reg.issues.push({ agent: id, level: 'error', message: `invalid agent.json: ${(err as Error).message}` });
      }
    }
    if (skills) reg.validateSkills(skills);
    return reg;
  }

  register(agent: RegisteredAgent): void {
    if (this.agents.has(agent.definition.id)) throw new Error(`duplicate agent ${agent.definition.id}`);
    this.agents.set(agent.definition.id, agent);
  }

  validateSkills(skills: SkillRegistry): void {
    for (const a of this.agents.values()) {
      const r = skills.resolveForAgent(a.definition);
      for (const m of r.missing) this.issues.push({ agent: a.definition.id, level: 'error', message: `unknown skill "${m}"` });
      for (const n of r.notOwned) this.issues.push({ agent: a.definition.id, level: 'error', message: `skill "${n}" is not a specialized skill declared for this agent` });
    }
    const orchestrators = [...this.agents.values()].filter((a) => a.definition.kind === 'orchestrator');
    if (orchestrators.length !== 1) this.issues.push({ agent: '*', level: 'error', message: `expected exactly one orchestrator, found ${orchestrators.length}` });
  }

  get(id: string): RegisteredAgent | undefined {
    return this.agents.get(id);
  }

  require(id: string): RegisteredAgent {
    const a = this.agents.get(id);
    if (!a) throw new Error(`unknown agent "${id}"`);
    return a;
  }

  list(): RegisteredAgent[] {
    return [...this.agents.values()];
  }

  ids(): string[] {
    return [...this.agents.keys()];
  }

  permissionsOf(id: string): Set<Permission> {
    return new Set(this.agents.get(id)?.definition.permissions ?? []);
  }

  /** Agent responsible for a task type (first specialist that declares it). */
  agentForTaskType(type: string): string | undefined {
    return this.list().find((a) => a.definition.taskTypes.includes(type))?.definition.id;
  }
}
