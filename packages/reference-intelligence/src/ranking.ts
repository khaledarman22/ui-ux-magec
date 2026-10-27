import type { Reference } from '@ui-ux-magec/schemas';

export interface RankingQuery {
  category?: string;
  industry?: string;
  keywords?: string[];
  /** Styles to avoid (e.g. a rejected direction). */
  avoidStyles?: string[];
  /** References explicitly excluded (rejected composition, already used for this scope). */
  excludeIds?: string[];
}

export interface RankOptions {
  limit?: number;
  /** MMR trade-off: 1 = pure relevance, 0 = pure diversity. Default 0.7 keeps relevance dominant. */
  lambda?: number;
  /** Per-use penalty so frequently used references do not win every time. */
  usagePenalty?: number;
  /** Global usage counts by canonical URL (opt-in global knowledge). */
  globalUsage?: Record<string, number>;
  includeUnverified?: boolean;
}

export interface RankedReference {
  reference: Reference;
  score: number;
  relevance: number;
  reasons: string[];
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
}

export function relevanceOf(ref: Reference, q: RankingQuery): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (q.category && ref.category === q.category) {
    score += 0.35;
    reasons.push('category match');
  }
  if (q.industry && ref.industry && ref.industry.toLowerCase() === q.industry.toLowerCase()) {
    score += 0.15;
    reasons.push('industry match');
  }
  const kw = (q.keywords ?? []).map((k) => k.toLowerCase());
  if (kw.length) {
    const text = words(`${ref.title} ${ref.description} ${ref.style.join(' ')} ${ref.layout ?? ''} ${ref.discovered_by.query ?? ''}`);
    const hits = kw.filter((k) => text.has(k)).length;
    score += 0.25 * (hits / kw.length);
    if (hits) reasons.push(`${hits}/${kw.length} keywords`);
  }
  // Agent-assessed relevance from analysis, when available, carries the remaining weight.
  score += 0.25 * ref.relevance_score;
  if (q.avoidStyles?.length && ref.style.some((s) => q.avoidStyles!.includes(s))) {
    score *= 0.4;
    reasons.push('style overlaps a rejected direction');
  }
  return { score: Math.min(1, score), reasons };
}

function similarity(a: Reference, b: Reference): number {
  let s = 0;
  if (a.source === b.source) s += 0.25;
  if (a.layout && a.layout === b.layout) s += 0.3;
  const sa = new Set(a.style);
  const shared = b.style.filter((x) => sa.has(x)).length;
  const union = new Set([...a.style, ...b.style]).size;
  if (union) s += 0.3 * (shared / union);
  if (a.color_direction && a.color_direction === b.color_direction) s += 0.15;
  return s;
}

/**
 * Maximal-marginal-relevance selection: each pick balances relevance against similarity to what was
 * already picked, and usage history lowers the score of references that keep getting reused.
 */
export function rankReferences(refs: Reference[], q: RankingQuery, opts: RankOptions = {}): RankedReference[] {
  const lambda = opts.lambda ?? 0.7;
  const penalty = opts.usagePenalty ?? 0.08;
  const limit = opts.limit ?? 8;
  const pool = refs
    .filter((r) => !r.rejected && (opts.includeUnverified || r.verified) && !(q.excludeIds ?? []).includes(r.reference_id))
    .map((r) => {
      const rel = relevanceOf(r, q);
      const uses = r.usage_count + (opts.globalUsage?.[r.canonical_url] ?? 0);
      const relevance = Math.max(0, rel.score - penalty * uses);
      return { reference: r, relevance, reasons: uses ? [...rel.reasons, `used ${uses}x`] : rel.reasons };
    });
  const picked: RankedReference[] = [];
  while (picked.length < limit && pool.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    pool.forEach((c, i) => {
      const maxSim = picked.length ? Math.max(...picked.map((p) => similarity(c.reference, p.reference))) : 0;
      const mmr = lambda * c.relevance - (1 - lambda) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    });
    const [c] = pool.splice(bestIdx, 1);
    picked.push({ ...c!, score: bestScore });
  }
  return picked;
}
