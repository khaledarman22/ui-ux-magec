import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from '@ui-ux-magec/schemas';
import { globalHome, writeJson } from '@ui-ux-magec/workspace';

export const DEFAULT_BRIDGE_PORT = 4517;

const ConfigSchema = z.object({
  version: z.literal(1),
  bridge: z.object({ port: z.number().int().min(1024).max(65535), token: z.string().min(32) }),
  integrations: z.record(z.string(), z.object({ installedAt: z.string(), target: z.string() })).default({}),
});
export type MagecConfig = z.infer<typeof ConfigSchema>;

export function configPath(home = globalHome()): string {
  return join(home, 'config.json');
}

export function readConfig(home = globalHome()): MagecConfig | null {
  const path = configPath(home);
  if (!existsSync(path)) return null;
  try {
    return ConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

/** Creates the per-user config with a random bridge pairing token (file mode 0600). Idempotent. */
export async function ensureConfig(home = globalHome()): Promise<{ config: MagecConfig; created: boolean }> {
  const existing = readConfig(home);
  if (existing) return { config: existing, created: false };
  const config: MagecConfig = {
    version: 1,
    bridge: { port: Number(process.env.MAGEC_BRIDGE_PORT) || DEFAULT_BRIDGE_PORT, token: randomBytes(24).toString('base64url') },
    integrations: {},
  };
  await writeJson(configPath(home), config);
  await chmod(configPath(home), 0o600).catch(() => undefined);
  return { config, created: true };
}

export async function updateConfig(mutate: (c: MagecConfig) => void, home = globalHome()): Promise<MagecConfig> {
  const { config } = await ensureConfig(home);
  mutate(config);
  const valid = ConfigSchema.parse(config);
  await writeJson(configPath(home), valid);
  await chmod(configPath(home), 0o600).catch(() => undefined);
  return valid;
}

export function bridgeSettings(home = globalHome()): { port: number; token: string } | null {
  const envToken = process.env.MAGEC_BRIDGE_TOKEN;
  const cfg = readConfig(home);
  const port = Number(process.env.MAGEC_BRIDGE_PORT) || cfg?.bridge.port || DEFAULT_BRIDGE_PORT;
  const token = envToken || cfg?.bridge.token;
  return token ? { port, token } : null;
}
