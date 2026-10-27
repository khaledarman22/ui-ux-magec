import { defineTool } from '@ui-ux-magec/agent-core';
import { ReferenceAnalysisSchema, ReferenceCandidateSchema, z } from '@ui-ux-magec/schemas';
import { SOURCES, GENERIC_SOURCE, planQueries, searchStringsFor } from '@ui-ux-magec/research';
import { rankReferences } from '@ui-ux-magec/reference-intelligence';
import { appendJsonl, readJsonl } from '@ui-ux-magec/workspace';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { AssetStore } from '../assets.js';
import type { MagecRuntime } from '../runtime.js';

const QueryLogSchema = z.object({ query: z.string(), category: z.string(), provider: z.string(), at: z.string(), results: z.number().int() });

export function researchTools(rt: MagecRuntime) {
  return [
    defineTool({
      name: 'magec_research_sources',
      description: 'Known inspiration sources with their access policy (public page, API key, login required) and strengths.',
      permissions: [],
      input: z.object({}),
      handler: async () => ({
        sources: [...SOURCES, GENERIC_SOURCE].map((s) => ({ id: s.id, name: s.name, access: s.access, strengths: s.strengths, notes: s.notes })),
        searchProvider: { id: rt.search.id, available: rt.search.available, ...(rt.search.unavailableReason ? { reason: rt.search.unavailableReason } : {}) },
      }),
    }),
    defineTool({
      name: 'magec_research_plan_queries',
      description: 'Build specific, feature-level research queries per category with rotating style angles, skipping queries already run in this project.',
      permissions: ['workspace.read'],
      input: z.object({
        industry: z.string(), market: z.string().optional(),
        categories: z.array(z.object({ category: z.string(), featureId: z.string().optional(), label: z.string().optional() })).min(1),
        styleAngles: z.array(z.string()).optional(), sources: z.array(z.string()).optional(), perCategory: z.number().int().min(1).max(6).default(2),
      }),
      handler: async (i) => {
        const { ws } = rt.requireProject();
        const { records } = await readJsonl(ws.resolve('research/queries.jsonl'), QueryLogSchema);
        return { queries: planQueries({ ...i, previousQueries: records.map((r) => r.query) }) };
      },
    }),
    defineTool({
      name: 'magec_research_search',
      description: 'Search the web through the configured search provider (Brave Search API). If unavailable, use your own web search and submit the URLs with magec_research_submit_candidates. Results are unverified until submitted.',
      permissions: ['research.network'],
      input: z.object({ query: z.string().min(3), category: z.string(), source: z.string().optional(), count: z.number().int().min(1).max(20).default(10) }),
      handler: async (i) => {
        const { ws, cache } = rt.requireProject();
        if (!rt.search.available) return { available: false, reason: rt.search.unavailableReason, results: [], hint: 'Use the host web search/browser, then call magec_research_submit_candidates with the URLs you found.' };
        const search = i.source ? searchStringsFor({ query: i.query, category: i.category, sources: [i.source] })[0]!.search : i.query;
        const { value, cached } = await cache.getOrCompute('research-results', `${rt.search.id}:${search}:${i.count}`, () => rt.search.search(search, { count: i.count }), { source: rt.search.id });
        await appendJsonl(ws.resolve('research/queries.jsonl'), { query: i.query, category: i.category, provider: rt.search.id, at: new Date().toISOString(), results: value.length });
        return { available: true, cached, search, results: value };
      },
    }),
    defineTool({
      name: 'magec_research_submit_candidates',
      description: 'Submit candidate reference URLs (from search or the host browser). Each is fetched (robots.txt respected, no logins) and stored; only retrieved pages are marked verified. Duplicates are detected.',
      permissions: ['research.network', 'references.write'],
      input: z.object({ candidates: z.array(ReferenceCandidateSchema).min(1).max(40), industry: z.string().optional(), taskId: z.string().optional(), downloadPreviews: z.boolean().default(true) }),
      handler: async (i) => {
        const { references, verifier, cache, ws } = rt.requireProject();
        const out = { added: [] as unknown[], duplicates: [] as unknown[], unverified: [] as unknown[] };
        for (const c of i.candidates) {
          const v = await verifier.verify(c);
          const res = await references.add({
            source: v.source, source_url: c.url, ...(v.sourceItemId ? { source_item_id: v.sourceItemId } : {}),
            title: v.title || c.title || '', description: v.description || c.description || '', category: c.category,
            ...(i.industry ? { industry: i.industry } : {}), style: c.style ?? [], verified: v.verified,
            verification: { ...(v.status ? { http_status: v.status } : {}), ...(v.finalUrl ? { final_url: v.finalUrl } : {}), ...(v.retrievedAt ? { retrieved_at: v.retrievedAt } : {}), method: 'fetch', ...(v.failure ? { failure: v.failure } : {}) },
            ...(v.previewUrl ? { preview_url: v.previewUrl } : {}),
            discovered_by: { provider: c.provider, ...(c.query ? { query: c.query } : {}), ...(i.taskId ? { task_id: i.taskId } : {}) },
          });
          if (c.query) await appendJsonl(ws.resolve('research/queries.jsonl'), { query: c.query, category: c.category, provider: c.provider, at: new Date().toISOString(), results: 1 });
          if (res.duplicateOf) {
            out.duplicates.push({ url: c.url, duplicateOf: res.duplicateOf });
            continue;
          }
          let preview: string | undefined;
          if (v.verified && v.previewUrl && i.downloadPreviews) {
            const d = await verifier.downloadPreview(v.previewUrl, cache, res.reference.reference_id);
            if (d.ok) {
              preview = d.path;
              await references.update(res.reference.reference_id, { preview_path: relative(ws.dir, d.path), preview_hash: d.hash });
            }
          }
          const item = { referenceId: res.reference.reference_id, url: c.url, source: v.source, verified: v.verified, title: res.reference.title, ...(preview ? { previewPath: preview } : {}) };
          if (v.verified) out.added.push(item);
          else out.unverified.push({ ...item, reason: v.failure });
        }
        return out;
      },
    }),
    defineTool({
      name: 'magec_reference_list',
      description: 'List references in the project library.',
      permissions: ['workspace.read'],
      input: z.object({ category: z.string().optional(), verifiedOnly: z.boolean().default(false), includeRejected: z.boolean().default(false) }),
      handler: async (i) => ({ references: await rt.requireProject().references.list(i) }),
    }),
    defineTool({
      name: 'magec_reference_select',
      description: 'Rank verified references for a purpose with diversity (MMR) and usage penalties so the same popular references are not picked every time.',
      permissions: ['workspace.read'],
      input: z.object({
        category: z.string().optional(), industry: z.string().optional(), keywords: z.array(z.string()).default([]),
        avoidStyles: z.array(z.string()).default([]), excludeIds: z.array(z.string()).default([]),
        limit: z.number().int().min(1).max(30).default(8), lambda: z.number().min(0).max(1).default(0.7), includeUnverified: z.boolean().default(false),
      }),
      handler: async (i) => {
        const refs = await rt.requireProject().references.list({ includeRejected: false });
        const store = await rt.knowledge.read();
        const ranked = rankReferences(refs, i, { limit: i.limit, lambda: i.lambda, includeUnverified: i.includeUnverified, ...(store.referenceUsageEnabled ? { globalUsage: store.referenceUsage } : {}) });
        const ws = rt.requireProject().ws;
        return { ranked: ranked.map((r) => ({ referenceId: r.reference.reference_id, title: r.reference.title, source: r.reference.source, url: r.reference.source_url, style: r.reference.style, score: Number(r.score.toFixed(3)), relevance: Number(r.relevance.toFixed(3)), reasons: r.reasons, ...(r.reference.preview_path ? { previewPath: ws.resolve(r.reference.preview_path) } : {}) })) };
      },
    }),
    defineTool({
      name: 'magec_reference_preview',
      description: 'Ensure a verified reference has a preview image saved permanently in assets/references (inspiration only, never placed in designs) and return its absolute path for visual inspection.',
      permissions: ['research.network', 'assets.write'],
      input: z.object({ referenceId: z.string() }),
      handler: async (i, ctx) => {
        const { references, verifier, cache, ws } = rt.requireProject();
        const ref = await references.get(i.referenceId);
        if (!ref) throw new Error(`reference ${i.referenceId} not found`);
        // A permanent copy is kept in assets/references; the cached copy may be pruned.
        const assets = new AssetStore(ws);
        const kept = (await assets.list({ kind: 'reference' })).find((a) => a.referenceId === ref.reference_id);
        if (kept) return { previewPath: ws.resolveProject(kept.path), savedAs: kept.path };
        if (ref.preview_path && existsSync(ws.resolve(ref.preview_path))) {
          const saved = await assets.keepReferencePreview(ws.resolve(ref.preview_path), ref.reference_id, ref.source_url, ctx.agentId);
          return { previewPath: ws.resolveProject(saved.path), savedAs: saved.path };
        }
        if (!ref.verified) return { previewPath: null, reason: 'reference is not verified; previews are only downloaded for retrieved pages' };
        if (!ref.preview_url) return { previewPath: null, reason: 'the page exposes no preview image; inspect the live page with the host browser if available' };
        const d = await verifier.downloadPreview(ref.preview_url, cache, ref.reference_id);
        if (!d.ok) return { previewPath: null, reason: d.reason };
        await references.update(ref.reference_id, { preview_path: relative(ws.dir, d.path), preview_hash: d.hash });
        const saved = await assets.keepReferencePreview(d.path, ref.reference_id, ref.source_url, ctx.agentId);
        return { previewPath: ws.resolveProject(saved.path), savedAs: saved.path, mimeType: d.mimeType };
      },
    }),
    defineTool({
      name: 'magec_reference_save_analysis',
      description: 'Save a structured visual analysis of a reference. Only analyse what you actually inspected (preview image, live page or screenshot).',
      permissions: ['references.write'],
      input: ReferenceAnalysisSchema.omit({ analysis_id: true, created_at: true, analyzed_by: true }),
      handler: async (i, ctx) => rt.requireProject().references.saveAnalysis({ ...i, analyzed_by: ctx.agentId }),
    }),
    defineTool({
      name: 'magec_reference_mark_used',
      description: 'Record that references informed a decision or design (raises their usage count to diversify future selection).',
      permissions: ['references.write'],
      input: z.object({ referenceIds: z.array(z.string()).min(1) }),
      handler: async (i) => {
        const { references } = rt.requireProject();
        await references.markUsed(i.referenceIds);
        const refs = await references.list({ includeRejected: true });
        await rt.knowledge.recordReferenceUsage(refs.filter((r) => i.referenceIds.includes(r.reference_id)).map((r) => r.canonical_url));
        return { ok: true };
      },
    }),
    defineTool({
      name: 'magec_reference_reject',
      description: 'Reject a reference as unsuitable (with reason) so it is excluded from selection.',
      permissions: ['references.write'],
      input: z.object({ referenceId: z.string(), reason: z.string().min(3) }),
      handler: async (i) => rt.requireProject().references.reject(i.referenceId, i.reason),
    }),
  ];
}
