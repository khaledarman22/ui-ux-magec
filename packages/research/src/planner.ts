import type { ResearchQuery } from '@ui-ux-magec/schemas';
import { SOURCES, getSource } from './sources.js';

export interface QueryPlanInput {
  industry: string;
  market?: string;
  categories: Array<{ category: string; featureId?: string; label?: string }>;
  /** Style angles to diversify results (e.g. editorial, minimal, bold-typographic). */
  styleAngles?: string[];
  sources?: string[];
  previousQueries?: string[];
  perCategory?: number;
}

const DEFAULT_ANGLES = ['editorial', 'minimal', 'bold typographic', 'immersive imagery', 'data-rich', 'playful', 'luxury', 'brutalist'];

/** Which sources suit which kind of research: component patterns vs. whole-site direction vs. app flows. */
function sourcesFor(category: string, allowed: string[]): string[] {
  const c = category.toLowerCase();
  let preferred: string[];
  if (/(checkout|cart|onboarding|flow|signup|login|settings|dashboard|filter|search|form|table|empty|error|navigation|mobile)/.test(c)) preferred = ['dribbble', 'mobbin', 'behance', 'web'];
  else if (/(hero|landing|homepage|header|footer|about|story)/.test(c)) preferred = ['awwwards', 'land-book', 'siteinspire', 'behance', 'onepagelove', 'web'];
  else if (/(brand|identity|logo|moodboard|palette|typography)/.test(c)) preferred = ['behance', 'pinterest', 'dribbble'];
  else preferred = ['behance', 'dribbble', 'awwwards', 'web'];
  const filtered = preferred.filter((s) => allowed.includes(s));
  return filtered.length ? filtered : allowed.slice(0, 3);
}

/**
 * Builds specific, feature-level queries (e.g. "real estate property filter interface") instead of one
 * generic "real estate website" search, rotates style angles for diversity and skips queries already run.
 */
export function planQueries(input: QueryPlanInput): ResearchQuery[] {
  const allowed = input.sources?.length ? input.sources : [...SOURCES.map((s) => s.id), 'web'];
  const angles = input.styleAngles?.length ? input.styleAngles : DEFAULT_ANGLES;
  const previous = new Set((input.previousQueries ?? []).map((q) => q.toLowerCase().trim()));
  const per = input.perCategory ?? 2;
  const out: ResearchQuery[] = [];
  let angleIdx = previous.size % angles.length;
  for (const cat of input.categories) {
    const subject = (cat.label ?? cat.category).replace(/-/g, ' ');
    const candidates: string[] = [
      `${input.industry} ${subject} design`,
      `${input.industry} ${subject} ui`,
      ...angles.map((a) => `${a} ${input.industry} ${subject}`),
      ...(input.market ? [`${input.market} ${input.industry} ${subject}`] : []),
      `${subject} ui pattern`,
    ];
    let added = 0;
    for (let i = 0; i < candidates.length && added < per; i++) {
      // Rotate through angle-specific candidates first so repeated research explores new styles.
      const pick = i < 2 ? candidates[i]! : candidates[2 + ((angleIdx + i) % angles.length)] ?? candidates[i]!;
      const q = pick.replace(/\s+/g, ' ').trim();
      if (previous.has(q.toLowerCase()) || out.some((o) => o.query === q)) continue;
      out.push({
        query: q,
        category: cat.category,
        ...(cat.featureId ? { featureId: cat.featureId } : {}),
        sources: sourcesFor(cat.category, allowed),
        ...(i >= 2 ? { styleAngle: angles[(angleIdx + i) % angles.length] } : {}),
      });
      added++;
    }
    angleIdx = (angleIdx + 1) % angles.length;
  }
  return out;
}

/** Expands a query into per-source search strings using `site:` filters. */
export function searchStringsFor(q: ResearchQuery): Array<{ source: string; search: string }> {
  return q.sources.map((id) => {
    const src = getSource(id);
    return { source: id, search: src?.siteQuery ? `${q.query} ${src.siteQuery}` : q.query };
  });
}
