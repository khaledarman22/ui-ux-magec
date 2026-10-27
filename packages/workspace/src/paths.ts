import { homedir } from 'node:os';
import { join } from 'node:path';

export const WORKSPACE_DIRNAME = '.ui-ux-magec';

export const WORKSPACE_SUBDIRS = [
  'planning', 'tasks', 'research', 'references', 'concepts', 'design-system', 'figma', 'memory',
  'cache', 'checkpoints', 'feedback', 'reports', 'logs', 'locks',
] as const;

export const ASSET_SUBDIRS = ['assets/logos', 'assets/images', 'assets/icons', 'assets/references'] as const;

/** Areas an agent may write through `artifact_write`. State files (project/manifest/state/tasks) are service-owned. */
export const WRITABLE_AREAS = ['planning', 'research', 'references', 'concepts', 'design-system', 'figma', 'reports', 'feedback', 'memory'] as const;
export type WritableArea = (typeof WRITABLE_AREAS)[number];

/** Directories that are persistent project state and therefore included in checkpoints. */
export const CHECKPOINT_PATHS = [
  'project.json', 'state.json', 'manifest.json', 'tasks/tasks.json', 'planning', 'concepts', 'design-system',
  'figma/mappings.json', 'memory', 'feedback', 'references/references.json',
] as const;

/**
 * Global (per-user) home. Holds configuration and explicitly opted-in reusable knowledge only — never
 * private project data, so deleting a project folder deletes the project.
 */
export function globalHome(): string {
  return process.env.MAGEC_HOME || join(homedir(), '.ui-ux-magec');
}
