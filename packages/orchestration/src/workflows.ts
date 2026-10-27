import type { NewTask, ProductAnalysis, Project, ResearchPlan } from '@ui-ux-magec/schemas';

/** Stage names recorded in state.json and used as checkpoint labels. */
export const STAGES = {
  requirements: 'requirements-completed',
  research: 'research-completed',
  concept: 'concept-selected',
  designSystem: 'design-system-created',
  foundations: 'figma-foundations-created',
  page: (slug: string) => `page-designed:${slug}`,
  qa: (slug: string) => `qa-completed:${slug}`,
} as const;

export function newProjectSeed(project: Project, hasBrandAssets: boolean): NewTask[] {
  const wf = 'new-project';
  return [
    {
      idempotencyKey: `${wf}:product-analysis`, workflowId: wf, agent: 'product-analyst', type: 'product-analysis', priority: 90,
      title: 'Analyze the product, audience, features, sitemap and user flows',
      description: `Brief: ${project.brief || '(see planning/brief.md)'}\nRecord every assumption you make. Only ask the user when a missing answer would materially change the product.`,
      inputRefs: ['planning/brief.md'],
    },
    {
      idempotencyKey: `${wf}:brand-analysis`, workflowId: wf, agent: 'brand-identity-agent', type: 'brand-analysis', priority: 80,
      title: hasBrandAssets ? 'Analyze the supplied brand assets and define digital brand rules' : 'Propose a digital brand identity (no brand assets supplied)',
      description: hasBrandAssets ? 'Inspect files in assets/logos and assets/images. Preserve established brand constraints.' : 'No assets were supplied: propose an identity and record it as proposed decisions.',
      dependencies: [`${wf}:product-analysis`],
      inputRefs: ['planning/product-analysis.json', 'assets/'],
    },
    {
      idempotencyKey: `${wf}:research-plan`, workflowId: wf, agent: 'research-agent', type: 'research-plan', priority: 80,
      title: 'Plan feature-specific design research',
      description: 'Derive research categories from the features and sitemap (hero, listing cards, filters, detail gallery, forms, empty states...). Use magec_research_plan_queries.',
      dependencies: [`${wf}:product-analysis`],
      params: { scope: 'project' },
      inputRefs: ['planning/product-analysis.json'],
    },
  ];
}

export interface ExpansionContext {
  project: Project;
  analysis: ProductAnalysis | null;
  plan: ResearchPlan | null;
  workflowId: string;
  /** Idempotency key (or id) of the brand analysis task to depend on. */
  brandKey?: string;
  /** Rejected directions the new concepts must not repeat. */
  avoid?: string[];
  /** Suffix for Figma page names so a new direction never overwrites an existing one. */
  pageSuffix?: string;
}

/** After the research plan exists: research → analysis → concepts → design system → Figma pages → QA. */
/** Images and icons a page needs, sourced before the page is designed (generated, stock or icon sets). */
export function assetTask(key: string, workflowId: string, page: string, pageName: string, dependencies: string[], extra: Record<string, unknown> = {}): NewTask {
  return {
    idempotencyKey: key, workflowId, agent: 'asset-agent', type: 'asset-sourcing', priority: 52,
    title: `Source images and icons for "${pageName}"`,
    description: 'List every image and icon the page needs from the concept and sitemap. Generate images if your host has an image-generation tool, otherwise download free-license stock photos; fetch icons from an open-source set. Everything goes into assets/ with provenance.',
    dependencies, params: { page, pageName, ...extra },
  };
}

export function designPipeline(ctx: ExpansionContext, researchPlanKey: string): NewTask[] {
  const wf = ctx.workflowId;
  const tasks: NewTask[] = [];
  const categories = [...new Set((ctx.plan?.queries ?? []).map((q) => q.category))];
  const analysisKeys: string[] = [];
  for (const category of categories) {
    const rk = `${wf}:research:${category}`;
    const vk = `${wf}:visual-analysis:${category}`;
    tasks.push({
      idempotencyKey: rk, workflowId: wf, agent: 'research-agent', type: 'research', priority: 70,
      title: `Research references: ${category}`,
      description: 'Run the planned queries for this category across multiple sources, verify every candidate by retrieval, deduplicate and rank. Never record unretrieved results as verified.',
      dependencies: [researchPlanKey], params: { category, scope: 'project' },
    });
    tasks.push({
      idempotencyKey: vk, workflowId: wf, agent: 'visual-analysis-agent', type: 'visual-analysis', priority: 65,
      title: `Analyze references visually: ${category}`,
      description: 'Inspect previews (images) of verified references and record structured analyses. Separate visual appeal from usability.',
      dependencies: [rk], params: { category },
    });
    analysisKeys.push(vk);
  }
  const conceptKey = `${wf}:concepts`;
  tasks.push({
    idempotencyKey: conceptKey, workflowId: wf, agent: 'creative-director', type: 'concept-generation', priority: 60,
    title: 'Generate creative concepts and recommend one',
    description: 'Produce 2–3 substantially different, original concepts grounded in the analyses and brand. Recommend one based on project goals.',
    dependencies: [...analysisKeys, ...(ctx.brandKey ? [ctx.brandKey] : [])],
    params: { scope: 'project', ...(ctx.avoid?.length ? { avoid: ctx.avoid } : {}) },
  });
  let designDeps = [conceptKey];
  if (ctx.project.settings.conceptSelection === 'user') {
    const ak = `${wf}:concept-approval`;
    tasks.push({
      idempotencyKey: ak, workflowId: wf, agent: 'master-orchestrator', type: 'concept-approval', priority: 60,
      title: 'User selects the creative concept', description: 'Waiting for the user to approve or choose a concept (ui-ux-magec approve).',
      dependencies: [conceptKey],
    });
    designDeps = [ak];
  }
  const dsKey = `${wf}:design-system`;
  tasks.push({
    idempotencyKey: dsKey, workflowId: wf, agent: 'design-system-agent', type: 'design-system', priority: 55,
    title: 'Define the design system (tokens, components, states, responsive and RTL rules)',
    dependencies: designDeps,
  });
  const fKey = `${wf}:figma-foundations`;
  tasks.push({
    idempotencyKey: fKey, workflowId: wf, agent: 'figma-designer', type: 'figma-foundations', priority: 50,
    title: 'Create Figma foundations: variables, text styles and core components',
    dependencies: [dsKey], scope: 'figma:foundations',
  });
  const pages = (ctx.analysis?.sitemap ?? []).filter((p) => p.priority !== 'could');
  const qaKeys: string[] = [];
  for (const page of pages) {
    const pk = `${wf}:figma-page:${page.slug}`;
    const qk = `${wf}:qa:${page.slug}:1`;
    const ak = `${wf}:assets:${page.slug}`;
    tasks.push(assetTask(ak, wf, page.slug, page.name, [dsKey]));
    tasks.push({
      idempotencyKey: pk, workflowId: wf, agent: 'figma-designer', type: 'figma-page-design', priority: page.priority === 'must' ? 45 : 35,
      title: `Design page "${page.name}" in Figma (${ctx.project.settings.breakpoints.join(' + ')})`,
      dependencies: [fKey, ak], scope: `figma:page:${page.slug}`,
      params: { page: page.slug, pageName: page.name, breakpoints: ctx.project.settings.breakpoints, direction: ctx.project.direction, ...(ctx.pageSuffix ? { figmaPageSuffix: ctx.pageSuffix } : {}) },
    });
    tasks.push({
      idempotencyKey: qk, workflowId: wf, agent: 'design-qa-agent', type: 'design-qa', priority: 40,
      title: `QA page "${page.name}" (iteration 1)`,
      dependencies: [pk], params: { page: page.slug, iteration: 1 },
    });
    qaKeys.push(qk);
  }
  tasks.push({
    idempotencyKey: `${wf}:summary`, workflowId: wf, agent: 'master-orchestrator', type: 'project-summary', priority: 10,
    title: 'Summarize the project outcome, links and limitations', dependencies: qaKeys.length ? qaKeys : [fKey],
  });
  return tasks;
}

export function researchWorkflow(workflowId: string, brief: { category: string; request: string }): NewTask[] {
  const planKey = `${workflowId}:research-plan`;
  const rk = `${workflowId}:research:${brief.category}`;
  return [
    {
      idempotencyKey: planKey, workflowId, agent: 'research-agent', type: 'research-plan', priority: 80,
      title: `Plan research: ${brief.category}`, description: brief.request, params: { scope: brief.category, category: brief.category, request: brief.request },
    },
    {
      idempotencyKey: rk, workflowId, agent: 'research-agent', type: 'research', priority: 75,
      title: `Research ${brief.category}`, description: brief.request, dependencies: [planKey], params: { category: brief.category, request: brief.request },
    },
    {
      idempotencyKey: `${workflowId}:visual-analysis:${brief.category}`, workflowId, agent: 'visual-analysis-agent', type: 'visual-analysis', priority: 70,
      title: `Analyze ${brief.category} references`, dependencies: [rk], params: { category: brief.category },
    },
  ];
}

export function auditWorkflow(workflowId: string, mode: 'audit' | 'suggest' | 'extend', request: string): NewTask[] {
  const snap = `${workflowId}:snapshot`;
  const audit = `${workflowId}:ux-audit`;
  const tasks: NewTask[] = [
    { idempotencyKey: snap, workflowId, agent: 'workspace-manager', type: 'figma-snapshot', priority: 90, title: 'Snapshot the existing Figma file (pages, frames, components, styles, variables)' },
    {
      idempotencyKey: audit, workflowId, agent: 'ux-audit-agent', type: 'ux-audit', priority: 80, title: `UX audit (${mode} mode)`,
      description: request, dependencies: [snap], params: { mode },
    },
  ];
  if (mode === 'extend') {
    // New screens must be built from the file's existing visual language, so derive tokens from it first.
    tasks.push({
      idempotencyKey: `${workflowId}:design-system`, workflowId, agent: 'design-system-agent', type: 'design-system', priority: 75,
      title: 'Derive the design system from the existing Figma file',
      description: 'Build tokens from the snapshot (existing paint/text styles and variables) and list existing components to reuse. Do not invent a new identity.',
      dependencies: [audit], inputRefs: ['figma/snapshot.json', 'reports/ux-audit.json'], params: { fromExisting: true },
    });
  }
  if (mode === 'suggest' || mode === 'extend') {
    tasks.push({
      idempotencyKey: `${workflowId}:research-plan`, workflowId, agent: 'research-agent', type: 'research-plan', priority: 70,
      title: 'Plan research for the gaps found by the audit', dependencies: [audit], params: { scope: 'audit-gaps', fromAudit: true },
    });
  }
  return tasks;
}
