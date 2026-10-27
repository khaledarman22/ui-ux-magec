import { describe, expect, it } from 'vitest';
import { decideQA, runStructuralQA } from '@ui-ux-magec/quality-assurance';
import type { SerializedNode } from '@ui-ux-magec/schemas';
import { tokens } from '../helpers/fixtures.js';

const text = (id: string, characters: string, color: string, extra: Partial<SerializedNode> = {}): SerializedNode => ({ id, name: id, type: 'TEXT', x: 0, y: 0, width: 200, height: 24, characters, fontSize: 16, fontName: { family: 'Inter', style: 'Regular' }, fills: [{ type: 'SOLID', color, opacity: 1, visible: true }], ...extra } as SerializedNode);

describe('structural QA', () => {
  it('finds low contrast, placeholder copy and missing fonts on read-back nodes', () => {
    const tree = {
      id: '1:1', name: 'Home — Desktop', type: 'FRAME', x: 0, y: 0, width: 1440, height: 900, fills: [{ type: 'SOLID', color: '#FFFFFF', opacity: 1, visible: true }],
      children: [text('2:1', 'Lorem ipsum dolor sit amet', '#BBBBBB'), text('2:2', 'Real headline', '#111111', { hasMissingFont: true } as never)], childCount: 2,
    } as unknown as SerializedNode;
    const r = runStructuralQA({ screens: [{ screenId: 'home-desktop', tree, breakpoint: 'desktop', direction: 'ltr' }], tokens: tokens(), expectedCoverage: [{ page: 'home', breakpoint: 'desktop' }, { page: 'home', breakpoint: 'mobile' }] });
    const rules = r.issues.map((i) => i.rule);
    expect(rules).toContain('text-contrast');
    expect(rules).toContain('placeholder-content');
    expect(rules).toContain('missing-font');
    expect(rules).toContain('responsive-coverage');
    // Every check is either passed, failed or explicitly skipped — never silently passed.
    for (const c of r.checks) expect(['passed', 'failed', 'skipped']).toContain(c.status);
  });

  it('reports checks it could not run as skipped', () => {
    const tree = { id: '1:1', name: 'Empty', type: 'FRAME', x: 0, y: 0, width: 100, height: 100, childCount: 0, children: [] } as unknown as SerializedNode;
    const r = runStructuralQA({ screens: [{ screenId: 's', tree }] });
    expect(r.checks.find((c) => c.rule === 'spacing-scale')?.status).toBe('skipped');
  });

  it('bounds the fix loop by the iteration limit', () => {
    const blocking = [{ issueId: 'iss_1', severity: 'major', rule: 'text-contrast', message: 'x' }] as never;
    expect(decideQA(blocking, 1, 3, { visualReviewPerformed: true }).action).toBe('fix');
    expect(decideQA(blocking, 3, 3, { visualReviewPerformed: true }).action).toBe('stop');
    expect(decideQA([], 1, 3, { visualReviewPerformed: true }).action).toBe('pass');
  });

  it('flags manual positioning and copy-pasted structures in the read-back tree', () => {
    const t = (id: string) => text(id, 'Fast', '#111111');
    const card = (id: string, layoutMode = 'VERTICAL') => ({ id, name: `Card ${id}`, type: 'FRAME', layoutMode, x: 0, y: 0, width: 200, height: 100, children: [t(`${id}a`), t(`${id}b`)] });
    const tree = {
      id: '1:1', name: 'Home — Desktop', type: 'FRAME', layoutMode: 'VERTICAL', x: 0, y: 0, width: 1440, height: 900,
      children: [
        { id: '2:1', name: 'Features', type: 'FRAME', layoutMode: 'HORIZONTAL', x: 0, y: 0, width: 1440, height: 200, children: [card('3:1'), card('3:2')] },
        { id: '2:2', name: 'Loose', type: 'FRAME', layoutMode: 'NONE', x: 0, y: 0, width: 1440, height: 200, children: [t('4:1')] },
      ],
    } as unknown as SerializedNode;
    const r = runStructuralQA({ screens: [{ screenId: 'home-desktop', tree }] });
    expect(r.issues.filter((i) => i.rule === 'auto-layout').map((i) => i.nodeId)).toEqual(['2:2']);
    expect(r.issues.filter((i) => i.rule === 'repeated-structure')).toHaveLength(1);
    expect(r.checks.find((c) => c.rule === 'auto-layout')?.status).toBe('failed');
  });
});
