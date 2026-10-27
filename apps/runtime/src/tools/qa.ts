import { defineTool } from '@ui-ux-magec/agent-core';
import { z, type SerializedNode } from '@ui-ux-magec/schemas';
import { runStructuralQA } from '@ui-ux-magec/quality-assurance';
import type { MagecRuntime } from '../runtime.js';
import { loadTokens } from './design.js';

export function qaTools(rt: MagecRuntime) {
  return [
    defineTool({
      name: 'magec_qa_run',
      description: 'Structural QA on the LIVE Figma nodes of designed screens (read back through the bridge): contrast, missing fonts, clipping/overflow, token usage, naming, placeholders, touch targets, RTL alignment, responsive coverage. Optionally exports PNG previews for visual review.',
      permissions: ['qa.write', 'figma.read'],
      input: z.object({ page: z.string().optional(), screenIds: z.array(z.string()).optional(), iteration: z.number().int().min(1).default(1), exportPreviews: z.boolean().default(true), scale: z.number().min(0.25).max(2).default(0.5) }),
      handler: async (i) => {
        const p = rt.requireProject();
        await p.figma.ensureFile();
        const mappings = (await p.figma.mappings()).filter((m) => m.logicalId.startsWith('screen/') && m.logicalId.split('/').length === 2 && m.status !== 'deleted');
        const roots = mappings.filter((m) => {
          const id = m.logicalId.slice('screen/'.length);
          if (i.screenIds) return i.screenIds.includes(id);
          return !i.page || id === i.page || id.startsWith(`${i.page}-`);
        });
        if (!roots.length) return { screens: 0, checks: [], issues: [], previews: [], note: 'no designed screens found for this scope (nothing was written through the bridge yet)' };
        const screens = [];
        const previews: Array<{ screen: string; path: string; absolutePath: string }> = [];
        const missing: string[] = [];
        for (const m of roots) {
          let tree: SerializedNode;
          try {
            tree = (await rt.transport.request({ op: 'read_node', nodeId: m.nodeId, depth: 12 })) as SerializedNode;
          } catch {
            missing.push(m.logicalId);
            continue;
          }
          const screenId = m.logicalId.slice('screen/'.length);
          screens.push({ screenId, tree, ...(tree.meta?.breakpoint ? { breakpoint: tree.meta.breakpoint as 'desktop' | 'tablet' | 'mobile' } : {}), ...(tree.meta?.direction ? { direction: tree.meta.direction as 'ltr' | 'rtl' } : {}) });
          if (i.exportPreviews) {
            const r = await p.figma.exportPreview(m.nodeId, `${screenId}-it${i.iteration}`, i.scale);
            previews.push({ screen: screenId, path: r.path, absolutePath: p.ws.resolve(r.path) });
          }
        }
        let tokens;
        try {
          tokens = await loadTokens(p);
        } catch {
          tokens = undefined;
        }
        const bps = p.ws.getProject().settings.breakpoints;
        const pages = i.page ? [i.page] : [];
        const result = runStructuralQA({ screens, ...(tokens ? { tokens } : {}), ...(pages.length ? { expectedCoverage: pages.flatMap((page) => bps.map((bp) => ({ page, breakpoint: bp }))) } : {}) });
        return { screens: screens.length, missingScreens: missing, ...result, previews, note: 'Inspect the preview images yourself for visual review; report visualReview.performed=true only if you did.' };
      },
    }),
  ];
}
