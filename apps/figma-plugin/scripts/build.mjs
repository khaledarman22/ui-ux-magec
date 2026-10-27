// Bundles the plugin into manifest.json + dist/code.js + dist/ui.html. The bridge port and pairing token come
// from ~/.ui-ux-magec/config.json (created here if missing) and are baked into this machine's build, so the
// plugin connects automatically. dist/ is git-ignored; never share a built plugin.
import { build } from 'esbuild';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const home = process.env.MAGEC_HOME || join(homedir(), '.ui-ux-magec');
const cfgPath = join(home, 'config.json');
let config = null;
try { config = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch { /* created below */ }
if (!config?.bridge?.token) {
  // Same shape as ensureConfig() in @ui-ux-magec/figma-bridge.
  config = { version: 1, bridge: { port: Number(process.env.MAGEC_BRIDGE_PORT) || 4517, token: randomBytes(24).toString('base64url') }, integrations: config?.integrations ?? {} };
  mkdirSync(home, { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  chmodSync(cfgPath, 0o600);
}
const port = Number(process.env.MAGEC_BRIDGE_PORT) || config.bridge.port || 4517;
const token = process.env.MAGEC_BRIDGE_TOKEN || config.bridge.token;

mkdirSync(join(root, 'dist'), { recursive: true });
await build({
  entryPoints: [join(root, 'src/code.ts')],
  bundle: true,
  outfile: join(root, 'dist/code.js'),
  target: 'es2017',
  format: 'iife',
  define: { __BRIDGE_PORT__: String(port), __BRIDGE_TOKEN__: JSON.stringify(token) },
  logLevel: 'warning',
});
writeFileSync(join(root, 'dist/ui.html'), readFileSync(join(root, 'src/ui.html'), 'utf8'));
const manifest = {
  name: 'ui-ux-magec bridge',
  id: 'ui-ux-magec-bridge-dev',
  api: '1.0.0',
  main: 'dist/code.js',
  ui: 'dist/ui.html',
  editorType: ['figma'],
  documentAccess: 'dynamic-page',
  enablePrivatePluginApi: true,
  networkAccess: {
    allowedDomains: ['none'],
    devAllowedDomains: [`ws://localhost:${port}`, `http://localhost:${port}`],
    reasoning: 'Connects only to the local ui-ux-magec runtime on this computer.',
  },
};
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`figma plugin built (bridge port ${port}) -> ${join(root, 'manifest.json')}`);
