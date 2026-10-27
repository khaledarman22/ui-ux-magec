/**
 * MOCK agents: a deterministic AgentExecutor that performs each task type through the REAL runtime tools
 * (same calls a model would make), with canned creative content. It exercises orchestration, permissions,
 * contracts, claim verification, Figma writes (to the mock document) and QA — but involves no LLM.
 */
import type { AgentExecutor, AgentRunRequest, AgentRunResult } from '@ui-ux-magec/agent-core';
import type { FetchLike } from '@ui-ux-magec/research';
import { homeSpec } from './fixtures.js';

export const MOCK_SITES: Record<string, string> = {
  'https://studio-north.example/work/agency-hero': 'North Studio — editorial agency hero',
  'https://dribbble.com/shots/24681357-Agency-hero-concept': 'Agency hero concept with kinetic type',
  'https://www.behance.net/gallery/192837465/Marketing-Agency-Website': 'Marketing agency website case study',
  'https://bold-labs.example/': 'Bold Labs — data-driven growth agency',
};

/** MOCK network for research: serves the pages above (plus permissive robots.txt and preview images). */
export const mockWeb: FetchLike = async (url) => {
  const u = new URL(url);
  if (u.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /', { headers: { 'content-type': 'text/plain' } });
  if (u.host === 'images.unsplash.com') return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, u.pathname.length]), { headers: { 'content-type': 'image/jpeg' } });
  if (u.host === 'unpkg.com' && u.pathname.endsWith('.svg')) {
    const name = u.pathname.split('/').pop()!.replace('.svg', '');
    if (name === 'no-such-icon') return new Response('not found', { status: 404 });
    return new Response(`<!-- @license mock - ISC --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="lucide lucide-${name}"><path d="M5 12h14" /></svg>`, { headers: { 'content-type': 'image/svg+xml' } });
  }
  if (u.pathname.endsWith('.png')) return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]), { headers: { 'content-type': 'image/png' } });
  const title = MOCK_SITES[url] ?? MOCK_SITES[url.replace(/\/$/, '')];
  if (!title) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
  return new Response(`<html><head><title>${title}</title><meta property="og:title" content="${title}"><meta property="og:image" content="https://${u.host}/preview.png"></head><body>${'<p>case study</p>'.repeat(30)}</body></html>`, { headers: { 'content-type': 'text/html' } });
};

type Invoke = AgentRunRequest['invoke'];
async function call<T = any>(invoke: Invoke, name: string, input: Record<string, unknown>): Promise<T> {
  const r = await invoke(name, input);
  if (!r.ok) throw new Error(`${name}: ${r.error.message}`);
  return r.result as T;
}

export interface ScriptOptions {
  heroTitle?: () => string;
  /** Task types that should fail (to test failure handling). */
  failTypes?: Set<string>;
  qaFailFirst?: boolean;
}

export class ScriptedAgents implements AgentExecutor {
  readonly name = 'scripted-mock';
  readonly available = true;
  calls: Array<{ agent: string; type: string }> = [];
  private qaRuns = 0;
  constructor(private readonly opts: ScriptOptions = {}) {}

  async run(req: AgentRunRequest): Promise<AgentRunResult> {
    const { task, invoke } = req;
    this.calls.push({ agent: task.agent, type: task.type });
    const complete = async (output: unknown) => {
      const r = await call(invoke, 'magec_task_complete', { taskId: task.taskId, output });
      if (!r.accepted) throw new Error(`output rejected: ${r.errors.join('; ')}`);
      return r;
    };
    if (this.opts.failTypes?.has(task.type)) {
      await call(invoke, 'magec_task_fail', { taskId: task.taskId, message: `simulated ${task.type} failure`, kind: 'external', retryable: false });
      return done();
    }
    switch (task.type) {
      case 'product-analysis':
        await complete({
          productType: 'marketing website', industry: 'digital marketing agency', market: 'MENA', summary: 'Premium agency site that converts visitors into qualified leads.',
          audiences: [{ name: 'Marketing directors', needs: ['proof of results', 'clear services'] }],
          features: [
            { id: 'hero', name: 'Hero with value proposition', description: 'Above-the-fold pitch', priority: 'must', justification: 'Visitors decide within seconds whether the agency fits.', pages: ['home'], researchCategories: ['hero-section'] },
            { id: 'case-studies', name: 'Case studies', description: 'Results-led stories', priority: 'should', justification: 'Proof of outcomes is the main purchase driver for agencies.', pages: ['home'], researchCategories: [] },
          ],
          mvpFeatureIds: ['hero'],
          sitemap: [{ slug: 'home', name: 'Home', purpose: 'Convert', sections: [{ id: 'hero', name: 'Hero', purpose: 'Pitch', featureIds: ['hero'] }, { id: 'testimonials', name: 'Testimonials', purpose: 'Trust' }] }, { slug: 'careers', name: 'Careers', purpose: 'Hiring', priority: 'could' }],
          languages: ['en', 'ar'], direction: 'both',
          assumptions: [{ statement: 'Primary goal is lead generation', reason: 'brief mentions growth', impact: 'medium' }],
        });
        break;
      case 'brand-analysis':
        await complete({ assetsInspected: ['assets/logos/logo.png'], established: true, personality: ['confident'], colors: [{ hex: '#4F46E5', role: 'primary', source: 'extracted' }], typography: [{ family: 'Inter', usage: 'UI', source: 'proposed' }] });
        break;
      case 'research-plan':
        await complete({ goal: 'Find distinctive agency hero patterns', queries: [{ query: 'digital marketing agency hero section editorial', category: 'hero-section', sources: ['dribbble', 'behance', 'web'] }], avoid: (task.params.avoidRejected ? ['centered stock-photo hero'] : []) });
        break;
      case 'research': {
        const cat = String(task.params.category);
        const urls = Object.keys(MOCK_SITES);
        const r = await call(invoke, 'magec_research_submit_candidates', { candidates: [...urls.map((url) => ({ url, category: cat, provider: 'host', query: 'agency hero' })), { url: 'https://mobbin.com/screens/abc', category: cat, provider: 'host' }, { url: 'https://gone.example/404', category: cat, provider: 'host' }], taskId: task.taskId });
        // Already-known references found again are still evidence for this category.
        const ids = [...new Set([...r.added.map((a: any) => a.referenceId), ...r.duplicates.map((d: any) => d.duplicateOf.referenceId)])];
        await complete({ category: cat, summary: 'Verified agency hero references.', referenceIds: ids, sourcesTried: [{ source: 'dribbble', status: 'ok' }, { source: 'behance', status: 'ok' }, { source: 'mobbin', status: 'login-required' }], approaches: [{ name: 'Editorial', description: 'Large type', referenceIds: ids.slice(0, 1) }] });
        break;
      }
      case 'visual-analysis': {
        const report = await call(invoke, 'magec_artifact_read', { path: `research/report-${task.params.category}.json` });
        const wanted = new Set<string>(JSON.parse(report.content).referenceIds);
        const refs = (await call(invoke, 'magec_reference_list', { verifiedOnly: true })).references.filter((r: any) => wanted.has(r.reference_id));
        const ids: string[] = [];
        for (const ref of refs.slice(0, 3)) {
          await call(invoke, 'magec_reference_preview', { referenceId: ref.reference_id });
          const a = await call(invoke, 'magec_reference_save_analysis', { reference_id: ref.reference_id, inspected: { method: 'preview-image' }, layout_structure: 'split', visual_hierarchy: 'headline first', typography: 'large grotesk', color: 'dark + accent', strengths: ['clear value proposition'], scores: { visual_appeal: 0.8, usability: 0.7, relevance: 0.8, originality: 0.6 }, style: ['editorial'] });
          ids.push(a.analysis_id);
        }
        await complete({ category: String(task.params.category), analysisIds: ids, patterns: [{ name: 'Split hero', description: 'Copy left, visual right', referenceIds: refs.slice(0, 2).map((r: any) => r.reference_id) }], usabilityVsAppeal: 'Editorial type is striking but must keep the CTA visible.' });
        break;
      }
      case 'concept-generation': {
        const refs = (await call(invoke, 'magec_reference_list', { verifiedOnly: true })).references.map((r: any) => r.reference_id);
        const n = (task.params.scope as string) ?? 'project';
        const mk = (id: string, name: string) => ({ conceptId: id, name, philosophy: 'p', audienceFit: 'a', color: 'c', typography: 't', layout: 'l', interaction: 'i', advantages: ['x'], disadvantages: ['y'], referenceIds: refs.slice(0, 2), originalityNotes: 'principles synthesised, no layout copied' });
        await complete({ scope: n, concepts: [mk(`${task.taskId}-a`, 'Kinetic Editorial'), mk(`${task.taskId}-b`, 'Quiet Luxury')], recommendedConceptId: `${task.taskId}-a`, recommendationRationale: 'Best differentiation for the market' });
        break;
      }
      case 'design-system': {
        const t = await call(invoke, 'magec_tokens_generate', { primary: '#4F46E5', fontFamily: 'Inter', arabicFamily: 'Cairo' });
        await complete({ tokens: t.tokens, components: [{ id: 'button', name: 'Button', purpose: 'Primary actions', variants: ['primary', 'secondary'] }], rtlRules: ['mirror rows'] });
        break;
      }
      case 'figma-foundations': {
        await call(invoke, 'magec_figma_sync_tokens', { taskId: task.taskId });
        const spec = { ...homeSpec(), screens: [] };
        const r = await call(invoke, 'magec_figma_apply_spec', { taskId: task.taskId, spec });
        const j = await call(invoke, 'magec_task_get', { taskId: task.taskId });
        void j;
        await complete({ operationIds: r.operationIds, nodes: r.nodes, warnings: r.warnings });
        break;
      }
      case 'ux-audit': {
        const snap = JSON.parse((await call(invoke, 'magec_artifact_read', { path: 'figma/snapshot.json' })).content);
        const comps = snap.components.components as Array<{ id: string; name: string }>;
        await complete({
          mode: task.params.mode, inspected: { pages: snap.document.pages.map((p: any) => p.name), frames: snap.document.pages.reduce((n: number, p: any) => n + p.childCount, 0), components: comps.length },
          existingSystem: { colors: [], typography: [], components: comps.map((c) => c.name) },
          flows: [{ name: 'Compare plans', status: 'missing' }],
          gaps: [{ id: 'gap-pricing', kind: 'missing-screen', description: 'No pricing page', severity: 'major', recommendation: 'Add a pricing page reusing the existing Button' }],
          proposedWork: task.params.mode === 'extend' ? [{ title: 'Pricing page', page: 'Pricing', rationale: 'Missing screen in the purchase flow' }] : [],
        });
        break;
      }
      case 'asset-sourcing': {
        const strategy = await call(invoke, 'magec_asset_strategy', {});
        if (strategy.imageGeneration.runtime) throw new Error('runtime unexpectedly claims image generation');
        // No stock API in the mock: use "host search" results on an allowed free-license host.
        const img = await call(invoke, 'magec_asset_download', { url: `https://images.unsplash.com/photo-${task.params.page}-hero?fm=jpg`, sourcePage: `https://unsplash.com/photos/${task.params.page}-hero`, author: 'Mock Photographer', purpose: 'hero/photo', name: `${task.params.page}-hero`, taskId: task.taskId });
        const icons = await call(invoke, 'magec_icon_get', { set: 'lucide', names: ['arrow-right'], taskId: task.taskId });
        await complete({
          page: String(task.params.page), strategy: { imageGeneration: 'unavailable', note: 'mock host has no image tool' },
          images: [{ slot: 'hero/photo', assetId: img.asset.assetId, path: img.asset.path }],
          icons: icons.icons.map((i: any) => ({ slot: 'hero/cta-icon', assetId: i.assetId, path: i.path })),
        });
        break;
      }
      case 'figma-page-design':
        if (task.params.extendExisting) {
          // Reuse the user's existing component by node id instead of creating a new one.
          const snap = JSON.parse((await call(invoke, 'magec_artifact_read', { path: 'figma/snapshot.json' })).content);
          const button = snap.components.components.find((c: any) => /button/i.test(c.name));
          const spec = { specVersion: 1, screens: [{ id: `${task.params.page}-desktop`, name: 'Pricing — Desktop', page: String(task.params.pageName), breakpoint: 'desktop', sections: [{ id: 'plans', name: 'Plans', layout: { direction: 'column', gap: '$spacing.md', padding: '$spacing.xl' }, children: [{ id: 'title', type: 'TEXT', text: 'Simple, transparent pricing', textStyle: '$typography.h2' }, { id: 'cta', type: 'INSTANCE', componentRef: button.id }] }] }] };
          const r = await call(invoke, 'magec_figma_apply_spec', { taskId: task.taskId, spec, includeComponents: false });
          await complete({ operationIds: r.operationIds, nodes: r.nodes, warnings: r.warnings });
          break;
        }
      // falls through
      case 'figma-fix': {
        const title = this.opts.heroTitle?.() ?? 'Grow your brand with data-driven creativity';
        // Use the assets prepared for the page, when an asset-sourcing task ran.
        const report = await call(invoke, 'magec_artifact_read', { path: `reports/assets-${task.params.page ?? 'home'}.json` }).then((r) => JSON.parse(r.content)).catch(() => null);
        const assets = report ? { image: report.images[0]?.path, icon: report.icons[0]?.path } : {};
        const r = await call(invoke, 'magec_figma_apply_spec', { taskId: task.taskId, spec: homeSpec(title, assets), includeComponents: false });
        const prev = await call(invoke, 'magec_figma_export_preview', { logicalId: 'screen/home-desktop', name: `home-${task.taskId}` });
        await complete({ operationIds: r.operationIds, nodes: r.nodes, previews: [prev.path], warnings: r.warnings });
        break;
      }
      case 'design-qa': {
        const q = await call(invoke, 'magec_qa_run', { page: String(task.params.page), iteration: Number(task.params.iteration ?? 1) });
        this.qaRuns++;
        const issues = q.issues.map((i: any) => ({ ...i, source: 'structural' }));
        if (this.opts.qaFailFirst && this.qaRuns === 1) issues.push({ issueId: 'iss_forced', rule: 'visual-hierarchy', severity: 'major', message: 'CTA is not prominent enough', source: 'visual' });
        const blocking = issues.filter((i: any) => i.severity === 'critical' || i.severity === 'major');
        await complete({ scope: `page:${task.params.page}`, iteration: Number(task.params.iteration ?? 1), structuralChecks: q.checks, visualReview: { performed: false, previews: [] }, issues, passed: blocking.length === 0, remainingLimitations: ['visual review not performed by the scripted mock'] });
        break;
      }
      case 'project-summary':
        await complete({ summary: 'Delivered home page in Figma.', completed: ['home'] });
        break;
      default:
        await call(invoke, 'magec_task_fail', { taskId: task.taskId, message: `scripted mock has no behaviour for ${task.type}`, kind: 'unknown', retryable: false });
    }
    return done();
  }
}

function done(): AgentRunResult {
  return { status: 'ended', finalText: 'done', turns: 1, toolCalls: 1 };
}
