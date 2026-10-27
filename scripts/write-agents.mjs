// Writes agents/<id>/agent.json from scripts/agents.config.mjs (AGENT.md files are maintained by hand).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS } from './agents.config.mjs';

const root = new URL('..', import.meta.url).pathname;
for (const a of AGENTS) {
  mkdirSync(join(root, 'agents', a.id), { recursive: true });
  writeFileSync(join(root, 'agents', a.id, 'agent.json'), JSON.stringify(a, null, 2) + '\n');
}
console.log(`wrote ${AGENTS.length} agent definitions`);
