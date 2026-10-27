import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { SkillFrontmatterSchema, type AgentDefinition, type SkillFrontmatter } from '@ui-ux-magec/schemas';

export interface SkillMeta extends SkillFrontmatter {
  dir: string;
  file: string;
  resources: { references: string[]; examples: string[]; schemas: string[] };
}

export interface LoadedSkill {
  meta: SkillMeta;
  body: string;
}

export interface SkillIssue {
  skill: string;
  level: 'error' | 'warning';
  message: string;
}

export interface AgentSkillResolution {
  shared: SkillMeta[];
  specialized: SkillMeta[];
  missing: string[];
  /** Specialized skills the agent requested that are not declared for it. */
  notOwned: string[];
}

const REQUIRED_SECTIONS = ['Purpose', 'When to use', 'Inputs', 'Outputs', 'Instructions', 'Constraints', 'Validation', 'Error handling'];

export function parseSkillFile(content: string): { frontmatter: unknown; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error('missing YAML frontmatter');
  return { frontmatter: parseYaml(m[1]!), body: m[2]!.trim() };
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).sort();
}

/**
 * Centralized skill registry. Discovery reads only frontmatter; skill bodies are loaded on demand so agents
 * pull the instructions they need instead of carrying every skill in context.
 */
export class SkillRegistry {
  private readonly skills = new Map<string, SkillMeta>();
  private readonly bodies = new Map<string, string>();
  readonly issues: SkillIssue[] = [];

  static discover(roots: string[]): SkillRegistry {
    const reg = new SkillRegistry();
    for (const root of roots) reg.scan(resolve(root));
    return reg;
  }

  private scan(root: string): void {
    for (const category of ['shared', 'specialized'] as const) {
      const base = join(root, category);
      if (!existsSync(base)) continue;
      for (const name of readdirSync(base).sort()) {
        const dir = join(base, name);
        const file = join(dir, 'SKILL.md');
        if (!statSync(dir).isDirectory() || !existsSync(file)) continue;
        try {
          const { frontmatter, body } = parseSkillFile(readFileSync(file, 'utf8'));
          const fm = SkillFrontmatterSchema.parse(frontmatter);
          if (fm.name !== name) this.issues.push({ skill: name, level: 'error', message: `frontmatter name "${fm.name}" does not match directory` });
          if (fm.category !== category) this.issues.push({ skill: name, level: 'error', message: `category "${fm.category}" but located in ${category}/` });
          if (category === 'specialized' && fm.agents.length === 0) this.issues.push({ skill: name, level: 'error', message: 'specialized skill must declare its agents' });
          if (this.skills.has(fm.name)) {
            this.issues.push({ skill: name, level: 'error', message: `duplicate skill name (also at ${this.skills.get(fm.name)!.dir})` });
            continue;
          }
          for (const section of REQUIRED_SECTIONS) {
            if (!new RegExp(`^##\\s+${section}`, 'im').test(body)) this.issues.push({ skill: name, level: 'warning', message: `missing "## ${section}" section` });
          }
          this.skills.set(fm.name, {
            ...fm, dir, file,
            resources: { references: listFiles(join(dir, 'references')), examples: listFiles(join(dir, 'examples')), schemas: listFiles(join(dir, 'schemas')) },
          });
          this.bodies.set(fm.name, body);
        } catch (err) {
          this.issues.push({ skill: name, level: 'error', message: `cannot parse SKILL.md: ${(err as Error).message}` });
        }
      }
    }
  }

  list(filter: { category?: 'shared' | 'specialized'; agent?: string } = {}): SkillMeta[] {
    return [...this.skills.values()].filter((s) =>
      (!filter.category || s.category === filter.category) &&
      (!filter.agent || s.category === 'shared' || s.agents.includes(filter.agent)));
  }

  get(name: string): SkillMeta | undefined {
    return this.skills.get(name);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  load(name: string): LoadedSkill {
    const meta = this.skills.get(name);
    if (!meta) throw new Error(`unknown skill "${name}"`);
    return { meta, body: this.bodies.get(name) ?? '' };
  }

  /** Reads a bundled resource (references/, examples/, schemas/) of a skill, refusing path traversal. */
  loadResource(name: string, rel: string): string {
    const meta = this.skills.get(name);
    if (!meta) throw new Error(`unknown skill "${name}"`);
    const full = resolve(meta.dir, rel);
    if (relative(meta.dir, full).startsWith('..')) throw new Error('resource path escapes skill directory');
    return readFileSync(full, 'utf8');
  }

  resolveForAgent(agent: Pick<AgentDefinition, 'id' | 'skills'>): AgentSkillResolution {
    const out: AgentSkillResolution = { shared: [], specialized: [], missing: [], notOwned: [] };
    for (const name of agent.skills.shared) {
      const s = this.skills.get(name);
      if (!s) out.missing.push(name);
      else if (s.category !== 'shared') out.notOwned.push(name);
      else out.shared.push(s);
    }
    for (const name of agent.skills.specialized) {
      const s = this.skills.get(name);
      if (!s) out.missing.push(name);
      else if (s.category !== 'specialized' || !s.agents.includes(agent.id)) out.notOwned.push(name);
      else out.specialized.push(s);
    }
    return out;
  }

  /** Compact index (name + description) used in system prompts instead of full skill bodies. */
  indexFor(agent: Pick<AgentDefinition, 'id' | 'skills'>): string {
    const r = this.resolveForAgent(agent);
    const line = (s: SkillMeta) => `- ${s.name}: ${s.description}`;
    return [
      'Shared skills:', ...r.shared.map(line),
      'Specialized skills:', ...r.specialized.map(line),
    ].join('\n');
  }

  validate(knownTools: Set<string>, knownAgents: Set<string>): SkillIssue[] {
    const issues = [...this.issues];
    for (const s of this.skills.values()) {
      for (const t of s.tools) if (!knownTools.has(t)) issues.push({ skill: s.name, level: 'error', message: `references unknown tool "${t}"` });
      for (const a of s.agents) if (!knownAgents.has(a)) issues.push({ skill: s.name, level: 'error', message: `references unknown agent "${a}"` });
      for (const r of s.related) if (!this.skills.has(r)) issues.push({ skill: s.name, level: 'warning', message: `related skill "${r}" does not exist` });
    }
    return issues;
  }
}
