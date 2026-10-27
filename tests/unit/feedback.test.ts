import { describe, expect, it } from 'vitest';
import { interpretFeedback } from '@ui-ux-magec/orchestration';

const vocab = {
  pages: [{ slug: 'home', name: 'Home' }, { slug: 'pricing', name: 'Pricing' }],
  sections: [{ id: 'hero', name: 'Hero', page: 'home' }, { id: 'testimonials', name: 'Testimonials', page: 'home' }],
};

describe('user feedback processing — interpretation', () => {
  it('scopes a section-level rejection to that section (English)', () => {
    const r = interpretFeedback("I don't like the hero. Create a completely different concept.", vocab);
    expect(r.intent).toBe('redesign');
    expect(r.scope.level).toBe('section');
    expect(r.scope.sections).toEqual(['hero']);
  });

  it('understands Arabic refinement feedback with attributes', () => {
    const r = interpretFeedback('خلي الهيرو أكثر فخامة', vocab);
    expect(r.intent).toBe('refine');
    expect(r.scope.sections).toEqual(['hero']);
    expect(r.attributes.join(' ')).toMatch(/premium|luxur/);
  });

  it('keeps preserve clauses separate from the change', () => {
    const r = interpretFeedback('Make the hero bolder but keep the colors', vocab);
    expect(r.intent).toBe('refine');
    expect(r.preserve.join(' ')).toMatch(/colou?r/);
  });

  it('recognises breakpoint-specific review requests', () => {
    const r = interpretFeedback('Review the mobile version of the pricing page', vocab);
    expect(r.intent).toBe('review');
    expect(r.scope.pages).toEqual(['pricing']);
    expect(r.scope.breakpoints).toEqual(['mobile']);
  });

  it('asks for clarification instead of removing everything', () => {
    const r = interpretFeedback('remove it', vocab);
    expect(r.needsClarification).toBe(true);
  });

  it('treats a project-level rejection as a new concept', () => {
    const r = interpretFeedback('I hate the whole direction, start over with a new concept', vocab);
    expect(['new-concept', 'reject-direction']).toContain(r.intent);
    expect(r.scope.level).toBe('project');
  });
});
