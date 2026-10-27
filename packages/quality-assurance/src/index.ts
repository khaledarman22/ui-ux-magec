import { ID_PREFIX, newId, type DesignTokens, type QAIssue, type QAReport, type SerializedNode } from '@ui-ux-magec/schemas';
import { composite, containsArabic, contrastRatio, requiredContrast } from '@ui-ux-magec/design-engine';

export interface QAScreenInput {
  screenId: string;
  breakpoint?: 'desktop' | 'tablet' | 'mobile';
  direction?: 'ltr' | 'rtl';
  /** Node tree as read back from Figma (read_node), never the spec we intended to write. */
  tree: SerializedNode;
}

export interface QAInput {
  screens: QAScreenInput[];
  tokens?: DesignTokens;
  /** Expected (page, breakpoint) coverage, e.g. from the sitemap and project settings. */
  expectedCoverage?: Array<{ page: string; breakpoint: 'desktop' | 'tablet' | 'mobile'; screenId?: string }>;
  minTouchTarget?: number;
}

export interface StructuralResult {
  checks: QAReport['structuralChecks'];
  issues: QAIssue[];
}

/** Filler copy that should never reach a delivered design (English and Arabic). */
const DUMMY_TEXT = /lorem ipsum|dolor sit amet|placeholder text|^\s*(tbd|todo|xxx+)\s*$|نص تجريبي|هذا النص هو مثال/i;

const RULES = ['text-contrast', 'missing-font', 'clipping', 'overflow', 'spacing-scale', 'type-scale', 'color-palette', 'layer-naming', 'placeholder-content', 'touch-target', 'rtl-alignment', 'empty-frame', 'responsive-coverage', 'auto-layout', 'repeated-structure'] as const;
type Rule = (typeof RULES)[number];

const DEFAULT_NAME = /^(Frame|Rectangle|Ellipse|Text|Group|Vector|Line|Polygon|Star|Component|Instance)( \d+)?$/;
const INTERACTIVE = /\b(button|btn|cta|link|tab|chip|toggle|checkbox|radio|icon-button|nav-item)\b/i;

function visibleSolid(n: SerializedNode): { color: string; opacity: number } | null {
  if (!n.fills || n.visible === false) return null;
  const solids = n.fills.filter((f) => f.type === 'SOLID' && f.visible !== false && f.color);
  const top = solids[solids.length - 1];
  return top?.color ? { color: top.color, opacity: top.opacity ?? 1 } : null;
}

/** Shape of a read-back subtree, ignoring content; equal signatures among siblings mean copy-pasted structure. */
function shape(n: SerializedNode): string {
  const own = n.type === 'INSTANCE' ? `I:${n.componentId ?? ''}` : `${n.type}:${n.layoutMode ?? 'NONE'}`;
  return n.children?.length ? `${own}(${n.children.map(shape).join(',')})` : own;
}

function within(child: NonNullable<SerializedNode['absoluteBoundingBox']>, parent: NonNullable<SerializedNode['absoluteBoundingBox']>, tol = 1): boolean {
  return child.x >= parent.x - tol && child.y >= parent.y - tol && child.x + child.width <= parent.x + parent.width + tol && child.y + child.height <= parent.y + parent.height + tol;
}

/**
 * Deterministic QA over inspected Figma data. Every rule that cannot be evaluated (e.g. no tokens supplied)
 * is reported as `skipped`, never as passed.
 */
export function runStructuralQA(input: QAInput): StructuralResult {
  const issues: QAIssue[] = [];
  const ran = new Set<Rule>();
  const skipped = new Map<Rule, string>();
  const tokens = input.tokens;
  const spacing = tokens ? new Set([0, ...Object.values(tokens.spacing)]) : null;
  const typeSizes = tokens ? new Set(Object.values(tokens.typography).map((t) => t.fontSize)) : null;
  const palette = tokens ? new Set([...Object.values(tokens.color), ...Object.values(tokens.themes).flatMap((t) => Object.values(t))].map((c) => c.slice(0, 7).toUpperCase())) : null;
  if (!tokens) for (const r of ['spacing-scale', 'type-scale', 'color-palette'] as const) skipped.set(r, 'no design tokens available');
  const minTouch = input.minTouchTarget ?? 44;

  const add = (rule: Rule, severity: QAIssue['severity'], message: string, n: SerializedNode, screen: string, extra: Partial<QAIssue> = {}) => {
    issues.push({ issueId: newId(ID_PREFIX.issue), rule, severity, message, nodeId: n.id, ...(n.logicalId ? { logicalId: n.logicalId } : {}), screen, source: 'structural', ...extra });
  };

  for (const screen of input.screens) {
    const mobile = screen.breakpoint === 'mobile';
    const rtl = screen.direction === 'rtl';
    const walk = (n: SerializedNode, bgStack: string[], parent: SerializedNode | null) => {
      if (n.visible === false) return;
      const solid = visibleSolid(n);
      const bg = bgStack[bgStack.length - 1] ?? '#FFFFFF';
      const ownBg = solid && n.type !== 'TEXT' ? composite(solid.color, bg, solid.opacity * (n.opacity ?? 1)) : null;

      const kids = (n.children ?? []).filter((c) => c.visible !== false);
      if ((n.type === 'FRAME' || n.type === 'COMPONENT') && kids.length) {
        ran.add('auto-layout');
        if (!n.layoutMode || n.layoutMode === 'NONE') add('auto-layout', 'major', `"${n.name}" positions its children manually instead of using auto layout`, n, screen.screenId, { suggestion: 'convert to an auto-layout frame (row or column) with gap and padding' });
        ran.add('repeated-structure');
        const groups = new Map<string, SerializedNode[]>();
        for (const c of kids) {
          if (c.type !== 'FRAME' || !c.children?.length) continue;
          const k = shape(c);
          groups.set(k, [...(groups.get(k) ?? []), c]);
        }
        for (const g of groups.values()) {
          if (g.length > 1) add('repeated-structure', 'major', `${g.length} copies of the same structure in "${n.name}" (${g.map((c) => `"${c.name}"`).join(', ')}) are not component instances`, g[0]!, screen.screenId, { suggestion: 'make one component (page-level is fine) and replace the copies with instances' });
        }
      }

      ran.add('layer-naming');
      if (DEFAULT_NAME.test(n.name)) add('layer-naming', 'minor', `layer "${n.name}" has a default name`, n, screen.screenId, { suggestion: 'name layers by purpose (e.g. "Hero / CTA")' });

      ran.add('placeholder-content');
      if (n.meta?.placeholder === 'true') add('placeholder-content', 'major', `"${n.name}" is placeholder content and must not ship as final`, n, screen.screenId, { suggestion: 'replace with a sourced, permitted asset or real copy' });
      else if (n.type === 'TEXT' && n.characters && DUMMY_TEXT.test(n.characters)) add('placeholder-content', 'major', `text "${n.name}" contains dummy copy`, n, screen.screenId, { suggestion: 'write real, project-specific copy' });

      if (n.type === 'TEXT') {
        ran.add('missing-font');
        if (n.hasMissingFont) add('missing-font', 'critical', `text "${n.name}" uses a font that is not available`, n, screen.screenId);
        ran.add('text-contrast');
        if (solid) {
          const fg = composite(solid.color, bg, solid.opacity * (n.opacity ?? 1));
          const size = typeof n.fontSize === 'number' ? n.fontSize : 16;
          const style = typeof n.fontName === 'object' ? n.fontName.style : 'Regular';
          const ratio = contrastRatio(fg, bg);
          const need = requiredContrast(size, style);
          if (ratio < need) add('text-contrast', ratio < need * 0.75 ? 'critical' : 'major', `contrast ${ratio.toFixed(2)}:1 for "${(n.characters ?? '').slice(0, 40)}" (needs ${need}:1)`, n, screen.screenId, { evidence: `${fg} on ${bg}, ${size}px ${style}` });
        }
        if (typeSizes && typeof n.fontSize === 'number') {
          ran.add('type-scale');
          if (!typeSizes.has(n.fontSize)) add('type-scale', 'minor', `font size ${n.fontSize}px is not on the type scale`, n, screen.screenId);
        }
        if (rtl && n.characters && containsArabic(n.characters)) {
          ran.add('rtl-alignment');
          // Alignment is irrelevant for auto-width text (the box hugs the glyphs), e.g. button labels.
          if (n.textAlignHorizontal === 'LEFT' && n.textAutoResize !== 'WIDTH_AND_HEIGHT') add('rtl-alignment', 'major', `Arabic text "${n.characters.slice(0, 30)}" is left-aligned in an RTL screen`, n, screen.screenId, { suggestion: 'use logical "start" alignment (right in RTL)' });
        }
      }

      if (palette && solid && n.type !== 'TEXT') {
        ran.add('color-palette');
        if (!palette.has(solid.color.slice(0, 7).toUpperCase())) add('color-palette', 'minor', `fill ${solid.color} on "${n.name}" is not a design token color`, n, screen.screenId);
      }
      if (palette && solid && n.type === 'TEXT') {
        ran.add('color-palette');
        if (!palette.has(solid.color.slice(0, 7).toUpperCase())) add('color-palette', 'minor', `text color ${solid.color} on "${n.name}" is not a design token color`, n, screen.screenId);
      }

      if (spacing && n.layoutMode && n.layoutMode !== 'NONE') {
        ran.add('spacing-scale');
        const values = [n.itemSpacing ?? 0, ...(n.padding ? [n.padding.top, n.padding.right, n.padding.bottom, n.padding.left] : [])];
        const off = values.filter((v) => !spacing.has(Math.round(v)));
        if (off.length) add('spacing-scale', 'minor', `spacing ${[...new Set(off)].join(', ')}px on "${n.name}" is off the spacing scale`, n, screen.screenId);
      }

      if (parent?.absoluteBoundingBox && n.absoluteBoundingBox) {
        if (!within(n.absoluteBoundingBox, parent.absoluteBoundingBox)) {
          if (parent.clipsContent) {
            ran.add('clipping');
            add('clipping', n.type === 'TEXT' ? 'major' : 'minor', `"${n.name}" is clipped by "${parent.name}"`, n, screen.screenId);
          } else {
            ran.add('overflow');
            add('overflow', 'minor', `"${n.name}" extends outside "${parent.name}"`, n, screen.screenId);
          }
        } else {
          ran.add('clipping');
          ran.add('overflow');
        }
      }

      if (mobile && INTERACTIVE.test(n.name) && n.width !== undefined && n.height !== undefined && n.type !== 'TEXT') {
        ran.add('touch-target');
        if (n.width < minTouch || n.height < minTouch) add('touch-target', 'major', `interactive "${n.name}" is ${Math.round(n.width)}×${Math.round(n.height)}px (minimum ${minTouch}×${minTouch})`, n, screen.screenId);
      }

      if ((n.type === 'FRAME') && (n.childCount ?? n.children?.length ?? 0) === 0 && !solid) {
        ran.add('empty-frame');
        add('empty-frame', 'info', `frame "${n.name}" is empty and invisible`, n, screen.screenId);
      }

      for (const c of n.children ?? []) walk(c, ownBg ? [...bgStack, ownBg] : bgStack, n);
    };
    walk(screen.tree, [], null);
  }

  if (input.expectedCoverage?.length) {
    ran.add('responsive-coverage');
    // A breakpoint is covered by any screen of that page (id "<page>" or "<page>-…") declaring that breakpoint.
    const covers = (s: QAInput['screens'][number], exp: NonNullable<QAInput['expectedCoverage']>[number]) =>
      exp.screenId ? s.screenId === exp.screenId : s.breakpoint === exp.breakpoint && (s.screenId === exp.page || s.screenId.startsWith(`${exp.page}-`));
    for (const exp of input.expectedCoverage) {
      const id = exp.screenId ?? `${exp.page}-${exp.breakpoint}`;
      if (!input.screens.some((s) => covers(s, exp))) issues.push({ issueId: newId(ID_PREFIX.issue), rule: 'responsive-coverage', severity: 'major', message: `missing ${exp.breakpoint} screen for page "${exp.page}"`, screen: id, source: 'structural' });
    }
  } else {
    skipped.set('responsive-coverage', 'no expected coverage supplied');
  }

  const checks: QAReport['structuralChecks'] = RULES.map((rule) => {
    if (skipped.has(rule) && !ran.has(rule)) return { rule, status: 'skipped' as const, note: skipped.get(rule)! };
    if (!ran.has(rule)) return { rule, status: 'skipped' as const, note: 'no applicable nodes' };
    return { rule, status: issues.some((i) => i.rule === rule && i.severity !== 'info') ? 'failed' as const : 'passed' as const };
  });
  return { checks, issues };
}

export interface QADecision {
  action: 'pass' | 'fix' | 'stop';
  blocking: QAIssue[];
  reason: string;
}

/**
 * QA loop policy: critical/major issues require fixes until the iteration limit; after that the loop stops
 * and the remaining issues are reported as limitations (never silently dropped).
 */
export function decideQA(issues: QAIssue[], iteration: number, maxIterations: number, opts: { visualReviewPerformed: boolean }): QADecision {
  const blocking = issues.filter((i) => i.severity === 'critical' || i.severity === 'major');
  if (!blocking.length) {
    return opts.visualReviewPerformed
      ? { action: 'pass', blocking, reason: 'no critical or major issues' }
      : { action: 'pass', blocking, reason: 'no structural blockers; visual review was not performed and is reported as a limitation' };
  }
  if (iteration >= maxIterations) return { action: 'stop', blocking, reason: `iteration limit (${maxIterations}) reached with ${blocking.length} blocking issue(s)` };
  return { action: 'fix', blocking, reason: `${blocking.length} blocking issue(s)` };
}

/** Groups blocking issues by screen into fix-task payloads for the Figma Designer. */
export function issuesToFixes(issues: QAIssue[]): Array<{ screen: string; issues: QAIssue[] }> {
  const by = new Map<string, QAIssue[]>();
  for (const i of issues) {
    if (i.severity !== 'critical' && i.severity !== 'major') continue;
    const key = i.screen ?? 'unknown';
    by.set(key, [...(by.get(key) ?? []), i]);
  }
  return [...by.entries()].map(([screen, list]) => ({ screen, issues: list }));
}
