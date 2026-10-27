import { join } from 'node:path';
import {
  AssumptionSchema, DecisionSchema, FeedbackSchema, GlobalPreferenceSchema, ID_PREFIX, newId, nowIso, z,
  type Assumption, type Decision, type Feedback, type FeedbackInterpretation,
} from '@ui-ux-magec/schemas';
import { appendJsonl, readJsonl, readJsonOr, writeJson, type Workspace } from '@ui-ux-magec/workspace';

/** Folds an append-only log keyed by id into the latest record per id (later lines win). */
function latestById<T>(records: T[], id: (r: T) => string): T[] {
  const map = new Map<string, T>();
  for (const r of records) map.set(id(r), r);
  return [...map.values()];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
}

function score(query: string[], text: string): number {
  if (!query.length) return 0;
  const words = new Set(tokenize(text));
  let hits = 0;
  for (const q of query) if (words.has(q)) hits++;
  return hits / query.length;
}

export interface MemorySearchHit {
  kind: 'decision' | 'assumption' | 'feedback';
  id: string;
  text: string;
  score: number;
  createdAt: string;
}

/**
 * Persistent, project-scoped memory: decisions, assumptions and feedback. Lives entirely inside the project
 * workspace, so it disappears with the project.
 */
export class ProjectMemory {
  constructor(private readonly ws: Workspace) {}

  private get decisionsPath(): string { return this.ws.resolve('memory/decisions.jsonl'); }
  private get assumptionsPath(): string { return this.ws.resolve('memory/assumptions.jsonl'); }
  private get feedbackPath(): string { return this.ws.resolve('feedback/feedback.jsonl'); }

  async recordDecision(input: Omit<Decision, 'decisionId' | 'projectId' | 'createdAt' | 'referenceIds' | 'tags' | 'scope' | 'rationale'> & Partial<Pick<Decision, 'referenceIds' | 'tags' | 'scope' | 'rationale'>>): Promise<Decision> {
    const decision = DecisionSchema.parse({ ...input, decisionId: newId(ID_PREFIX.decision), projectId: this.ws.projectId, createdAt: nowIso() });
    if (decision.supersedes) await this.setDecisionStatus(decision.supersedes, 'superseded');
    await appendJsonl(this.decisionsPath, decision);
    return decision;
  }

  async setDecisionStatus(decisionId: string, status: Decision['status']): Promise<Decision | null> {
    const current = (await this.listDecisions()).find((d) => d.decisionId === decisionId);
    if (!current) return null;
    const next = { ...current, status };
    await appendJsonl(this.decisionsPath, next);
    return next;
  }

  async listDecisions(filter: { status?: Decision['status'][]; scope?: string; topic?: string } = {}): Promise<Decision[]> {
    const { records } = await readJsonl(this.decisionsPath, DecisionSchema);
    return latestById(records, (d) => d.decisionId).filter((d) =>
      (!filter.status || filter.status.includes(d.status)) &&
      (!filter.scope || d.scope === filter.scope || d.scope.startsWith(`${filter.scope}/`)) &&
      (!filter.topic || d.topic === filter.topic));
  }

  async activeDecisions(): Promise<Decision[]> {
    return this.listDecisions({ status: ['accepted', 'proposed'] });
  }

  /** Rejected directions for a scope: used to avoid repeating a composition the user rejected. */
  async rejectedDirections(scope?: string): Promise<Decision[]> {
    return (await this.listDecisions({ status: ['rejected'] })).filter((d) => !scope || d.scope === 'project' || d.scope === scope || scope.startsWith(d.scope));
  }

  async recordAssumption(input: Pick<Assumption, 'statement'> & Partial<Omit<Assumption, 'assumptionId' | 'projectId' | 'createdAt'>>): Promise<Assumption> {
    const a = AssumptionSchema.parse({ ...input, assumptionId: newId(ID_PREFIX.assumption), projectId: this.ws.projectId, createdAt: nowIso() });
    await appendJsonl(this.assumptionsPath, a);
    return a;
  }

  async setAssumptionStatus(assumptionId: string, status: Assumption['status']): Promise<Assumption | null> {
    const current = (await this.listAssumptions()).find((a) => a.assumptionId === assumptionId);
    if (!current) return null;
    const next = { ...current, status };
    await appendJsonl(this.assumptionsPath, next);
    return next;
  }

  async listAssumptions(): Promise<Assumption[]> {
    const { records } = await readJsonl(this.assumptionsPath, AssumptionSchema);
    return latestById(records, (a) => a.assumptionId);
  }

  async recordFeedback(text: string, interpretation: FeedbackInterpretation, opts: { persistence?: 'project' | 'global'; createdTaskIds?: string[] } = {}): Promise<Feedback> {
    const fb = FeedbackSchema.parse({
      feedbackId: newId(ID_PREFIX.feedback), projectId: this.ws.projectId, text, interpretation,
      persistence: opts.persistence ?? 'project', createdTaskIds: opts.createdTaskIds ?? [], createdAt: nowIso(),
    });
    await appendJsonl(this.feedbackPath, fb);
    return fb;
  }

  async attachTasksToFeedback(feedbackId: string, taskIds: string[]): Promise<void> {
    const fb = (await this.listFeedback()).find((f) => f.feedbackId === feedbackId);
    if (!fb) return;
    await appendJsonl(this.feedbackPath, { ...fb, createdTaskIds: [...new Set([...fb.createdTaskIds, ...taskIds])] });
  }

  async listFeedback(): Promise<Feedback[]> {
    const { records } = await readJsonl(this.feedbackPath, FeedbackSchema);
    return latestById(records, (f) => f.feedbackId);
  }

  async search(query: string, opts: { limit?: number; kinds?: MemorySearchHit['kind'][] } = {}): Promise<MemorySearchHit[]> {
    const q = tokenize(query);
    const kinds = opts.kinds ?? ['decision', 'assumption', 'feedback'];
    const hits: MemorySearchHit[] = [];
    if (kinds.includes('decision')) {
      for (const d of await this.listDecisions()) {
        const text = `[${d.status}] ${d.topic} (${d.scope}): ${d.decision}. ${d.rationale}`;
        hits.push({ kind: 'decision', id: d.decisionId, text, score: score(q, `${text} ${d.tags.join(' ')}`), createdAt: d.createdAt });
      }
    }
    if (kinds.includes('assumption')) {
      for (const a of await this.listAssumptions()) {
        const text = `[${a.status}] ${a.statement} — ${a.reason}`;
        hits.push({ kind: 'assumption', id: a.assumptionId, text, score: score(q, text), createdAt: a.createdAt });
      }
    }
    if (kinds.includes('feedback')) {
      for (const f of await this.listFeedback()) {
        const text = `${f.text} (${f.interpretation.intent}, ${f.interpretation.scope.level})`;
        hits.push({ kind: 'feedback', id: f.feedbackId, text, score: score(q, text), createdAt: f.createdAt });
      }
    }
    return hits
      .filter((h) => q.length === 0 || h.score > 0)
      .sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt))
      .slice(0, opts.limit ?? 10);
  }
}

/* ---------- Global knowledge (opt-in, never project data) ---------- */

const GlobalStoreSchema = z.object({
  version: z.literal(1),
  preferences: z.array(GlobalPreferenceSchema).default([]),
  /** Usage counts of public reference URLs, only when `referenceUsageEnabled` is true. */
  referenceUsageEnabled: z.boolean().default(false),
  referenceUsage: z.record(z.string(), z.number().int()).default({}),
});
export type GlobalStore = z.infer<typeof GlobalStoreSchema>;

/**
 * Reusable cross-project knowledge. Holds only what the user explicitly saved as a reusable preference and,
 * when enabled, anonymous usage counts of public reference URLs. It never stores project ids, briefs,
 * decisions, feedback or designs, so it cannot be used to resurrect a deleted project.
 */
export class GlobalKnowledge {
  constructor(private readonly home: string) {}

  private get path(): string { return join(this.home, 'knowledge.json'); }

  async read(): Promise<GlobalStore> {
    return readJsonOr(this.path, GlobalStoreSchema, GlobalStoreSchema.parse({ version: 1 }));
  }

  async setPreference(key: string, value: string, note = ''): Promise<void> {
    const store = await this.read();
    store.preferences = store.preferences.filter((p) => p.key !== key);
    store.preferences.push({ key, value, note, createdAt: nowIso() });
    await writeJson(this.path, store);
  }

  async removePreference(key: string): Promise<boolean> {
    const store = await this.read();
    const before = store.preferences.length;
    store.preferences = store.preferences.filter((p) => p.key !== key);
    await writeJson(this.path, store);
    return store.preferences.length !== before;
  }

  async setReferenceUsageEnabled(enabled: boolean): Promise<void> {
    const store = await this.read();
    store.referenceUsageEnabled = enabled;
    if (!enabled) store.referenceUsage = {};
    await writeJson(this.path, store);
  }

  async recordReferenceUsage(canonicalUrls: string[]): Promise<boolean> {
    const store = await this.read();
    if (!store.referenceUsageEnabled) return false;
    for (const url of canonicalUrls) store.referenceUsage[url] = (store.referenceUsage[url] ?? 0) + 1;
    await writeJson(this.path, store);
    return true;
  }
}
