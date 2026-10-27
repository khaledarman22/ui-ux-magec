import type { MagecRuntime } from '../runtime.js';
import { projectTools } from './project.js';
import { taskTools } from './tasks.js';
import { researchTools } from './research.js';
import { designTools } from './design.js';
import { figmaTools } from './figma.js';
import { qaTools } from './qa.js';
import { assetTools } from './assets.js';

export function registerAllTools(rt: MagecRuntime): void {
  rt.tools.register(...projectTools(rt), ...taskTools(rt), ...researchTools(rt), ...designTools(rt), ...figmaTools(rt), ...qaTools(rt), ...assetTools(rt));
}
