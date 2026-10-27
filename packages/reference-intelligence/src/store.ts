import {
  ID_PREFIX, ReferenceAnalysisSchema, ReferenceSchema, newId, nowIso, z,
  type Reference, type ReferenceAnalysis,
} from '@ui-ux-magec/schemas';
import { readJson, readJsonOr, writeJson, type Workspace } from '@ui-ux-magec/workspace';
import { canonicalizeUrl, jaccard, titleTokens } from './canonical.js';

const StoreSchema = z.object({ version: z.literal(1), references: z.array(ReferenceSchema) });

export type DuplicateReason = 'canonical-url' | 'source-item-id' | 'preview-hash' | 'similar-title';

export interface AddResult {
  reference: Reference;
  duplicateOf?: { referenceId: string; reason: DuplicateReason };
  created: boolean;
}

export type NewReference = Omit<Reference, 'reference_id' | 'canonical_url' | 'created_at' | 'updated_at' | 'usage_count' | 'style' | 'relevance_score' | 'verification' | 'rejected' | 'title' | 'description'>
  & Partial<Pick<Reference, 'style' | 'relevance_score' | 'verification' | 'title' | 'description'>>;

/** Project reference library (references/references.json) with deduplication and provenance. */
export class ReferenceStore {
  constructor(private readonly ws: Workspace) {}

  private get file(): string { return this.ws.resolve('references/references.json'); }

  async list(filter: { category?: string; verifiedOnly?: boolean; includeRejected?: boolean } = {}): Promise<Reference[]> {
    const { references } = await readJsonOr(this.file, StoreSchema, { version: 1, references: [] });
    return references.filter((r) =>
      (!filter.category || r.category === filter.category) &&
      (!filter.verifiedOnly || r.verified) &&
      (filter.includeRejected || !r.rejected));
  }

  async get(id: string): Promise<Reference | undefined> {
    return (await this.list({ includeRejected: true })).find((r) => r.reference_id === id);
  }

  private async mutate<T>(fn: (refs: Reference[]) => T): Promise<T> {
    return this.ws.locks.withLock('state:references', `pid-${process.pid}`, async () => {
      const data = await readJsonOr(this.file, StoreSchema, { version: 1, references: [] });
      const out = fn(data.references);
      await writeJson(this.file, { version: 1, references: data.references.map((r) => ReferenceSchema.parse(r)) });
      return out;
    }, { waitMs: 10_000 });
  }

  /** Detects whether `candidate` duplicates an existing reference. */
  static findDuplicate(existing: Reference[], candidate: { canonical_url: string; source: string; source_item_id?: string; preview_hash?: string; title?: string }): AddResult['duplicateOf'] {
    for (const r of existing) {
      if (r.canonical_url === candidate.canonical_url) return { referenceId: r.reference_id, reason: 'canonical-url' };
      if (candidate.source_item_id && r.source === candidate.source && r.source_item_id === candidate.source_item_id) return { referenceId: r.reference_id, reason: 'source-item-id' };
      if (candidate.preview_hash && r.preview_hash === candidate.preview_hash) return { referenceId: r.reference_id, reason: 'preview-hash' };
    }
    if (candidate.title) {
      const host = hostOf(candidate.canonical_url);
      const tokens = titleTokens(candidate.title);
      if (tokens.size >= 3) {
        for (const r of existing) {
          if (hostOf(r.canonical_url) === host && jaccard(tokens, titleTokens(r.title)) >= 0.85) return { referenceId: r.reference_id, reason: 'similar-title' };
        }
      }
    }
    return undefined;
  }

  async add(input: NewReference): Promise<AddResult> {
    const canonical = canonicalizeUrl(input.source_url);
    return this.mutate((refs) => {
      const dup = ReferenceStore.findDuplicate(refs, { canonical_url: canonical, source: input.source, ...(input.source_item_id ? { source_item_id: input.source_item_id } : {}), ...(input.preview_hash ? { preview_hash: input.preview_hash } : {}), ...(input.title ? { title: input.title } : {}) });
      if (dup) {
        const existing = refs.find((r) => r.reference_id === dup.referenceId)!;
        // A later successful verification upgrades an unverified duplicate; it never downgrades a verified one.
        if (!existing.verified && input.verified) {
          Object.assign(existing, { verified: true, verification: input.verification ?? existing.verification, title: input.title || existing.title, description: input.description || existing.description, preview_url: input.preview_url ?? existing.preview_url, updated_at: nowIso() });
        }
        return { reference: { ...existing }, duplicateOf: dup, created: false };
      }
      const now = nowIso();
      const ref = ReferenceSchema.parse({ ...input, reference_id: newId(ID_PREFIX.reference), canonical_url: canonical, usage_count: 0, created_at: now, updated_at: now });
      refs.push(ref);
      return { reference: ref, created: true };
    });
  }

  async update(id: string, patch: Partial<Omit<Reference, 'reference_id' | 'canonical_url' | 'created_at'>>): Promise<Reference> {
    return this.mutate((refs) => {
      const r = refs.find((x) => x.reference_id === id);
      if (!r) throw new Error(`reference ${id} not found`);
      Object.assign(r, patch, { updated_at: nowIso() });
      return { ...r };
    });
  }

  async markUsed(ids: string[]): Promise<void> {
    await this.mutate((refs) => {
      for (const r of refs) if (ids.includes(r.reference_id)) r.usage_count += 1;
    });
  }

  async reject(id: string, reason: string): Promise<Reference> {
    return this.update(id, { rejected: true, rejection_reason: reason });
  }

  /** Saves a visual analysis. Analyses must reference a verified reference and an actual inspection. */
  async saveAnalysis(input: Omit<ReferenceAnalysis, 'analysis_id' | 'created_at'>): Promise<ReferenceAnalysis> {
    const ref = await this.get(input.reference_id);
    if (!ref) throw new Error(`reference ${input.reference_id} not found`);
    if (!ref.verified && input.inspected.method !== 'screenshot') throw new Error(`reference ${ref.reference_id} is unverified; analyse it only from an inspected screenshot`);
    const analysis = ReferenceAnalysisSchema.parse({ ...input, analysis_id: newId(ID_PREFIX.analysis), created_at: nowIso() });
    await writeJson(this.ws.resolve(`references/analyses/${analysis.analysis_id}.json`), analysis);
    await this.update(ref.reference_id, {
      analysis_id: analysis.analysis_id,
      originality_score: analysis.scores.originality,
      relevance_score: Math.max(ref.relevance_score, analysis.scores.relevance),
      style: [...new Set([...ref.style, ...analysis.style])],
      ...(analysis.layout_label ? { layout: analysis.layout_label } : {}),
    });
    return analysis;
  }

  async getAnalysis(analysisId: string): Promise<ReferenceAnalysis | null> {
    try {
      return await readJson(this.ws.resolve(`references/analyses/${analysisId}.json`), ReferenceAnalysisSchema);
    } catch {
      return null;
    }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
