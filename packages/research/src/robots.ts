interface Group {
  agents: string[];
  rules: Array<{ allow: boolean; path: string }>;
}

/** Minimal robots.txt evaluator: user-agent groups, Allow/Disallow, `*` and `$` patterns, longest match wins. */
export class RobotsPolicy {
  private constructor(private readonly groups: Group[]) {}

  static parse(text: string): RobotsPolicy {
    const groups: Group[] = [];
    let current: Group | null = null;
    let lastWasAgent = false;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === 'user-agent') {
        if (!current || !lastWasAgent) {
          current = { agents: [], rules: [] };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        lastWasAgent = true;
      } else if ((key === 'allow' || key === 'disallow') && current) {
        if (value || key === 'allow') current.rules.push({ allow: key === 'allow', path: value });
        lastWasAgent = false;
      } else {
        lastWasAgent = false;
      }
    }
    return new RobotsPolicy(groups);
  }

  static allowAll(): RobotsPolicy {
    return new RobotsPolicy([]);
  }

  static disallowAll(): RobotsPolicy {
    return new RobotsPolicy([{ agents: ['*'], rules: [{ allow: false, path: '/' }] }]);
  }

  isAllowed(path: string, userAgent: string): boolean {
    const ua = userAgent.toLowerCase();
    const specific = this.groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
    const groups = specific.length ? specific : this.groups.filter((g) => g.agents.includes('*'));
    let best: { allow: boolean; len: number } | null = null;
    for (const g of groups) {
      for (const r of g.rules) {
        if (!r.path) continue;
        if (matches(r.path, path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
      }
    }
    return best ? best.allow : true;
  }
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(`^${body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${anchored ? '$' : ''}`);
  return re.test(path);
}
