import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
// Resolve workspace packages to their TypeScript sources so tests never run stale builds.
const alias: Record<string, string> = {
  '@ui-ux-magec/runtime': `${root}apps/runtime/src/index.ts`,
  '@ui-ux-magec/cli': `${root}apps/cli/src/index.ts`,
  '@ui-ux-magec/integrations': `${root}integrations/src/index.ts`,
};
for (const name of readdirSync(`${root}packages`)) alias[`@ui-ux-magec/${name}`] = `${root}packages/${name}/src/index.ts`;

export default defineConfig({
  resolve: { alias },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    pool: 'forks',
    env: { MAGEC_REPO_ROOT: root },
  },
});
