// Removes build outputs from every workspace package.
import { rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
for (const group of ['packages', 'apps']) {
  const dir = join(root, group);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    for (const out of ['dist', 'tsconfig.tsbuildinfo']) rmSync(join(dir, name, out), { recursive: true, force: true });
  }
}
for (const out of ['dist', 'tsconfig.tsbuildinfo']) rmSync(join(root, 'integrations', out), { recursive: true, force: true });
console.log('cleaned build outputs');
