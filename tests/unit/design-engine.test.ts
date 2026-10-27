import { describe, expect, it } from 'vitest';
import { auditTokens, compileDesign, contrastRatio, DesignCompileError, flattenSpec } from '@ui-ux-magec/design-engine';
import { homeSpec, tokens } from '../helpers/fixtures.js';

describe('design engine', () => {
  it('computes WCAG contrast and generates AA-safe text colors', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    const t = tokens();
    expect(contrastRatio(t.color.text!, t.color.background!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.color['on-primary']!, t.color.primary!)).toBeGreaterThanOrEqual(4.5);
    expect(auditTokens(t).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('compiles specs to native node trees with stable logical ids', () => {
    const c = compileDesign(homeSpec(), tokens());
    expect(c.pages.sort()).toEqual(['Components', 'Home']);
    const desktop = c.screens.find((s) => s.screenId === 'home-desktop')!;
    const ids = flattenSpec(desktop.tree).map((n) => n.logicalId);
    expect(ids).toContain('screen/home-desktop/hero/copy/title');
    expect(new Set(ids).size).toBe(ids.length);
    expect(c.components[0]!.variants).toHaveLength(2);
    expect(c.components[0]!.setLogicalId).toBe('componentset/button');
    // Same spec -> same hash (idempotency input).
    expect(compileDesign(homeSpec(), tokens()).screens[0]!.specHash).toBe(desktop.specHash);
  });

  it('mirrors RTL screens and uses the Arabic font for Arabic text', () => {
    const c = compileDesign(homeSpec(), tokens());
    const rtl = flattenSpec(c.screens.find((s) => s.screenId === 'home-mobile-ar')!.tree);
    const title = rtl.find((n) => n.logicalId.endsWith('/title'))!;
    expect(title.text!.fontFamily).toBe('Cairo');
    expect(title.text!.align).toBe('RIGHT');
    const ltrTitle = flattenSpec(c.screens[0]!.tree).find((n) => n.logicalId.endsWith('/title'))!;
    expect(ltrTitle.text!.align).toBe('LEFT');
  });

  it('rejects unknown tokens instead of guessing', () => {
    const spec = homeSpec();
    (spec.screens![0]!.sections[0] as { fill?: string }).fill = '$color.does-not-exist';
    expect(() => compileDesign(spec, tokens())).toThrow(DesignCompileError);
  });

  describe('auto layout is enforced', () => {
    const screen = (sections: unknown[]) => ({ specVersion: 1 as const, screens: [{ id: 'home-desktop', name: 'Home', page: 'Home', breakpoint: 'desktop' as const, sections: sections as never }] });
    const label = (id: string, text: string) => ({ id, type: 'TEXT', text, textStyle: '$typography.body' });
    const errorsOf = (spec: unknown) => {
      try {
        compileDesign(spec as never, tokens());
        return [];
      } catch (err) {
        return (err as DesignCompileError).errors;
      }
    };

    it('rejects frames with children but no auto layout', () => {
      expect(errorsOf(screen([{ id: 'about', children: [label('t', 'About us')] }])).join(' ')).toMatch(/must use auto layout/);
    });

    it('rejects x/y inside auto layout but allows absolute overlays', () => {
      const withXY = screen([{ id: 'hero', layout: { direction: 'column' }, children: [{ ...label('t', 'Hi'), x: 40, y: 10 }] }]);
      expect(errorsOf(withXY).join(' ')).toMatch(/x\/y are not allowed inside auto layout/);
      const overlay = screen([{ id: 'hero', layout: { direction: 'column' }, children: [label('t', 'Hi'), { id: 'badge', type: 'RECTANGLE', width: 40, height: 40, absolute: true, x: 12, y: 12, fill: '$color.primary' }] }]);
      expect(errorsOf(overlay)).toEqual([]);
    });

    it('rejects copy-pasted repeated structures and accepts component instances', () => {
      const card = (id: string, title: string) => ({ id, layout: { direction: 'column' }, children: [label('title', title), label('body', 'Details')] });
      const copies = screen([{ id: 'features', layout: { direction: 'row' }, children: [card('a', 'Fast'), card('b', 'Secure'), card('c', 'Local')] }]);
      expect(errorsOf(copies).join(' ')).toMatch(/"a", "b", "c" repeat the same structure/);
      const asComponent = {
        ...screen([{ id: 'features', layout: { direction: 'row' }, children: ['Fast', 'Secure'].map((t, i) => ({ id: `f${i}`, type: 'INSTANCE', componentRef: 'feature-card', overrides: { title: t } })) }]),
        components: [{ id: 'feature-card', name: 'Feature Card', page: 'Home', variants: [{ props: {}, node: card('root', 'Title') }] }],
      };
      expect(errorsOf(asComponent)).toEqual([]);
      const compiled = compileDesign(asComponent as never, tokens());
      // Page-level component sits on the page, left of the screens (never on top of them).
      expect(compiled.components[0]!.page).toBe('Home');
      expect(compiled.components[0]!.variants[0]!.tree.x).toBeLessThan(0);
      expect(compiled.components[0]!.variants[0]!.tree.layout?.mode).toBe('VERTICAL');
    });

    it('requires image and icon references to be resolved by the runtime', () => {
      expect(errorsOf(screen([{ id: 'hero', layout: { direction: 'row' }, children: [{ id: 'p', width: 200, height: 200, image: 'assets/images/x.jpg' }] }])).join(' ')).toMatch(/was not resolved/);
    });
  });
});
