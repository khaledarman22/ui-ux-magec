import { defineTool } from '@ui-ux-magec/agent-core';
import { DesignSpecSchema, DesignSystemSpecSchema, DesignTokensSchema, z, type DesignTokens } from '@ui-ux-magec/schemas';
import { auditTokens, compileDesign, contrastRatio, flattenSpec, generateTokens, requiredContrast } from '@ui-ux-magec/design-engine';
import type { MagecRuntime, ProjectServices } from '../runtime.js';

export async function loadTokens(p: ProjectServices): Promise<DesignTokens> {
  const raw = await p.ws.readArtifactJson('design-system/design-system.json');
  const parsed = DesignSystemSpecSchema.safeParse(raw);
  if (!parsed.success) throw new Error('no valid design system yet (design-system/design-system.json); the design-system task must complete first');
  return parsed.data.tokens;
}

export function designTools(rt: MagecRuntime) {
  return [
    defineTool({
      name: 'magec_tokens_generate',
      description: 'Deterministically generate a token set (color ramps with WCAG-safe text colors, type scale, spacing, radii, shadows, grids) from brand inputs. Returns tokens and an accessibility audit; nothing is saved.',
      permissions: ['workspace.read'],
      input: z.object({
        primary: z.string(), secondary: z.string().optional(), neutralBase: z.string().optional(), background: z.string().optional(),
        fontFamily: z.string(), headingFamily: z.string().optional(), arabicFamily: z.string().optional(),
        baseFontSize: z.number().optional(), scaleRatio: z.number().min(1.05).max(1.8).optional(), spacingBase: z.number().optional(), dark: z.boolean().optional(),
      }),
      handler: async (i) => {
        const tokens = generateTokens(i);
        return { tokens, audit: auditTokens(tokens) };
      },
    }),
    defineTool({
      name: 'magec_tokens_audit',
      description: 'Audit a token set for contrast and coverage problems.',
      permissions: [],
      input: z.object({ tokens: DesignTokensSchema }),
      handler: async (i) => ({ issues: auditTokens(i.tokens) }),
    }),
    defineTool({
      name: 'magec_contrast_check',
      description: 'WCAG contrast ratios for color pairs, with the AA requirement for each text size.',
      permissions: [],
      input: z.object({ pairs: z.array(z.object({ fg: z.string(), bg: z.string(), fontSize: z.number().default(16), fontStyle: z.string().default('Regular') })).min(1).max(100) }),
      handler: async (i) => ({
        results: i.pairs.map((p) => {
          const ratio = contrastRatio(p.fg, p.bg);
          const need = requiredContrast(p.fontSize, p.fontStyle);
          return { ...p, ratio: Number(ratio.toFixed(2)), required: need, passes: ratio >= need };
        }),
      }),
    }),
    defineTool({
      name: 'magec_design_spec_validate',
      description: 'Validate and compile a design spec against the project tokens without touching Figma. Reports errors (unknown tokens, missing text styles...) and RTL/sizing warnings.',
      permissions: ['workspace.read'],
      input: z.object({ spec: z.unknown() }),
      handler: async (i) => {
        const p = rt.requireProject();
        const parsed = DesignSpecSchema.safeParse(i.spec);
        if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 40).map((x) => `${x.path.join('.')}: ${x.message}`) };
        try {
          const compiled = compileDesign(parsed.data, await loadTokens(p));
          return { ok: true, pages: compiled.pages, screens: compiled.screens.map((s) => ({ screenId: s.screenId, page: s.page, nodes: flattenSpec(s.tree).length })), components: compiled.components.map((c) => ({ id: c.componentId, variants: c.variants.length })), warnings: compiled.warnings };
        } catch (err) {
          return { ok: false, errors: ((err as { errors?: string[] }).errors ?? [(err as Error).message]).slice(0, 40) };
        }
      },
    }),
    defineTool({
      name: 'magec_design_spec_save',
      description: 'Validate and save a design spec to figma/specs/<name>.json (the editable source the Figma Designer applies).',
      permissions: ['workspace.write'],
      input: z.object({ name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), spec: z.unknown(), taskId: z.string().optional() }),
      handler: async (i, ctx) => {
        const p = rt.requireProject();
        const spec = DesignSpecSchema.parse(i.spec);
        const compiled = compileDesign(spec, await loadTokens(p));
        const saved = await p.ws.writeArtifact(`figma/specs/${i.name}.json`, spec, { kind: 'design-spec', producedBy: ctx.agentId, ...(i.taskId ? { taskId: i.taskId } : {}) });
        return { ...saved, warnings: compiled.warnings, screens: compiled.screens.map((s) => s.screenId) };
      },
    }),
  ];
}
