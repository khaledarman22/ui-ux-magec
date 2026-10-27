import { existsSync, readdirSync } from 'node:fs';
import {
  ConceptSetSchema, ProductAnalysisSchema, QAReportSchema, ResearchPlanSchema, TASK_CONTRACTS, UXAuditReportSchema, nowIso, slugify,
  type Feedback, type FeedbackInterpretation, type NewTask, type ProductAnalysis, type ResearchPlan, type Task,
} from '@ui-ux-magec/schemas';
import type { Workspace } from '@ui-ux-magec/workspace';
import type { ProjectMemory } from '@ui-ux-magec/memory';
import { isTerminal, type TaskStore } from '@ui-ux-magec/task-manager';
import { silentLogger, type Logger } from '@ui-ux-magec/logger';
import { interpretFeedback, type FeedbackVocabulary } from './feedback.js';
import { STAGES, assetTask, auditWorkflow, designPipeline, newProjectSeed, researchWorkflow } from './workflows.js';

export const APPROVAL_TYPES = ['approval', 'concept-approval'] as const;

export interface FeedbackOutcome {
  feedback: Feedback | null;
  interpretation: FeedbackInterpretation;
  tasks: Task[];
  superseded: Task[];
  clarification?: string;
}

export interface ResumeReport {
  projectId: string;
  validation: { ok: boolean; errors: string[]; warnings: string[] };
  repairs: string[];
  recoveredTasks: string[];
  lastCheckpoint: string | null;
  completedStages: string[];
  nextTasks: Array<{ taskId: string; agent: string; title: string }>;
  waitingForApproval: Array<{ taskId: string; title: string }>;
  failed: Array<{ taskId: string; title: string; error?: string }>;
  figmaLinked: boolean;
}

function shortId(): string {
  return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
}

/**
 * Deterministic core of the master orchestrator. The LLM-facing master-orchestrator agent decides *what* the
 * user wants; this class turns that into a consistent, persisted task graph, expands it as results arrive,
 * routes feedback into scoped work, and keeps checkpoints.
 */
export class Orchestrator {
  private readonly log: Logger;
  constructor(private readonly ws: Workspace, private readonly tasks: TaskStore, private readonly memory: ProjectMemory, opts: { log?: Logger } = {}) {
    this.log = opts.log ?? silentLogger;
  }

  /* ---------- Planning ---------- */

  async planNewProject(): Promise<Task[]> {
    const project = await this.ws.reloadProject();
    const logos = this.ws.resolveProject('assets/logos');
    const images = this.ws.resolveProject('assets/images');
    const hasAssets = [logos, images].some((d) => existsSync(d) && readdirSync(d).some((f) => !f.startsWith('.')));
    const created = await this.tasks.create(newProjectSeed(project, hasAssets));
    await this.ws.updateProject((p) => {
      if (p.status === 'initialized') p.status = 'planning';
    });
    return created;
  }

  async planResearch(request: string, category?: string): Promise<Task[]> {
    const cat = category ?? inferCategory(request);
    return this.tasks.create(researchWorkflow(`research-${shortId()}`, { category: cat, request }));
  }

  async planAudit(mode: 'audit' | 'suggest' | 'extend', request: string): Promise<Task[]> {
    await this.ws.updateProject((p) => {
      p.mode = 'existing';
      p.existingDesignMode = mode;
    });
    return this.tasks.create(auditWorkflow(`audit-${shortId()}`, mode, request));
  }

  async planReview(pages?: string[]): Promise<Task[]> {
    const designed = await this.designedPages();
    const targets = pages?.length ? designed.filter((p) => pages.includes(p)) : designed;
    const wf = `review-${shortId()}`;
    return this.tasks.create(targets.map((page) => ({
      idempotencyKey: `${wf}:qa:${page}`, workflowId: wf, agent: 'design-qa-agent', type: 'design-qa', priority: 60,
      title: `Review page "${page}"`, params: { page, iteration: 1, review: true },
    })));
  }

  private async analysis(): Promise<ProductAnalysis | null> {
    const raw = await this.ws.readArtifactJson('planning/product-analysis.json');
    const r = ProductAnalysisSchema.safeParse(raw);
    return r.success ? r.data : null;
  }

  private async researchPlan(rel: string): Promise<ResearchPlan | null> {
    const r = ResearchPlanSchema.safeParse(await this.ws.readArtifactJson(rel));
    return r.success ? r.data : null;
  }

  async designedPages(): Promise<string[]> {
    const done = await this.tasks.list({ type: 'figma-page-design', status: ['completed'] });
    return [...new Set(done.map((t) => String(t.params.page ?? '')).filter(Boolean))];
  }

  /* ---------- Expansion on completion ---------- */

  /** Applies workflow rules after a task completed: expands the graph, records decisions, checkpoints. */
  async onTaskCompleted(task: Task): Promise<Task[]> {
    const created: Task[] = [];
    const wf = task.workflowId ?? '';
    switch (task.type) {
      case 'product-analysis': {
        const a = await this.analysis();
        if (a) {
          await this.ws.updateProject((p) => {
            p.industry ??= a.industry;
            if (a.market) p.market ??= a.market;
            p.languages = a.languages;
            p.direction = a.direction;
            if (p.status === 'initialized' || p.status === 'planning') p.status = 'researching';
          });
          const known = new Set((await this.memory.listAssumptions()).map((x) => x.statement));
          for (const asm of a.assumptions) if (!known.has(asm.statement)) await this.memory.recordAssumption({ ...asm, agentId: task.agent });
        }
        await this.stage(STAGES.requirements);
        break;
      }
      case 'research-plan': {
        const plan = await this.researchPlan(TASK_CONTRACTS['research-plan'].artifactPath(task));
        const project = this.ws.getProject();
        if (wf === 'new-project' || wf.startsWith('redesign-')) {
          const brand = (await this.tasks.list({ type: 'brand-analysis' })).find((t) => t.status !== 'superseded' && t.status !== 'cancelled');
          const redesign = wf.startsWith('redesign-') ? await this.ws.readArtifactJson<{ pageSuffix?: string; rejected?: string[] }>(`planning/redesign-${wf}.json`) : null;
          created.push(...(await this.tasks.create(designPipeline({
            project, analysis: await this.analysis(), plan, workflowId: wf,
            ...(brand ? { brandKey: brand.taskId } : {}),
            ...(redesign?.pageSuffix ? { pageSuffix: redesign.pageSuffix } : {}),
            ...(redesign?.rejected?.length ? { avoid: redesign.rejected } : {}),
          }, task.taskId))));
        } else if (task.params.fromAudit && plan) {
          const cats = [...new Set(plan.queries.map((q) => q.category))];
          const analysisKeys: string[] = [];
          const list: NewTask[] = [];
          for (const c of cats) {
            list.push({ idempotencyKey: `${wf}:research:${c}`, workflowId: wf, agent: 'research-agent', type: 'research', title: `Research improvements: ${c}`, dependencies: [task.taskId], params: { category: c } });
            list.push({ idempotencyKey: `${wf}:visual-analysis:${c}`, workflowId: wf, agent: 'visual-analysis-agent', type: 'visual-analysis', title: `Analyze references: ${c}`, dependencies: [`${wf}:research:${c}`], params: { category: c } });
            analysisKeys.push(`${wf}:visual-analysis:${c}`);
          }
          list.push({ idempotencyKey: `${wf}:concepts`, workflowId: wf, agent: 'creative-director', type: 'concept-generation', title: 'Propose improvement directions for the audited design', dependencies: analysisKeys, params: { scope: 'audit-proposals', preserveExistingIdentity: true } });
          created.push(...(await this.tasks.create(list)));
        }
        break;
      }
      case 'research':
      case 'visual-analysis': {
        const open = await this.tasks.list({ workflowId: wf });
        if (open.filter((t) => t.type === 'research' || t.type === 'visual-analysis').every((t) => isTerminal(t.status) || t.taskId === task.taskId)) await this.stage(STAGES.research);
        break;
      }
      case 'concept-generation': {
        const set = ConceptSetSchema.safeParse(await this.ws.readArtifactJson(TASK_CONTRACTS['concept-generation'].artifactPath(task)));
        if (set.success) {
          const rec = set.data.concepts.find((c) => c.conceptId === set.data.recommendedConceptId) ?? set.data.concepts[0]!;
          const auto = this.ws.getProject().settings.conceptSelection === 'auto';
          await this.memory.recordDecision({
            topic: `concept:${set.data.scope}`, decision: `${rec.name} (${rec.conceptId})`, rationale: set.data.recommendationRationale,
            status: auto ? 'accepted' : 'proposed', scope: set.data.scope === 'project' ? 'project' : set.data.scope, source: 'agent', agentId: task.agent,
            referenceIds: rec.referenceIds, tags: ['concept'],
          });
          if (set.data.scope === 'project') await this.stage(STAGES.concept);
        }
        break;
      }
      case 'design-system':
        await this.stage(STAGES.designSystem);
        await this.ws.updateProject((p) => {
          p.status = 'designing';
        });
        break;
      case 'figma-foundations':
        await this.stage(STAGES.foundations);
        break;
      case 'figma-page-design':
        await this.stage(STAGES.page(String(task.params.page ?? 'unknown')));
        break;
      case 'design-qa':
        // Follow-ups were created in beforeComplete(); nothing else to expand here.
        break;
      case 'ux-audit': {
        const audit = UXAuditReportSchema.safeParse(await this.ws.readArtifactJson(TASK_CONTRACTS['ux-audit'].artifactPath(task)));
        if (audit.success && audit.data.mode === 'extend') {
          const list: NewTask[] = [];
          for (const w of audit.data.proposedWork.filter((x) => x.page)) {
            const slug = slugify(w.page!);
            list.push(assetTask(`${wf}:assets:${slug}`, wf, slug, w.page!, [task.taskId, `${wf}:design-system`], { extendExisting: true }));
            list.push({
              idempotencyKey: `${wf}:extend:${slug}`, workflowId: wf, agent: 'figma-designer', type: 'figma-page-design', priority: 50,
              title: `Extend: ${w.title}`, description: `${w.rationale}\nReuse the existing components, styles and variables. Do not modify existing frames; add new frames next to them.`,
              dependencies: [task.taskId, `${wf}:design-system`, `${wf}:assets:${slug}`], scope: `figma:page:${slug}`, params: { page: slug, pageName: w.page, extendExisting: true },
            });
            list.push({ idempotencyKey: `${wf}:qa:${slug}:1`, workflowId: wf, agent: 'design-qa-agent', type: 'design-qa', title: `QA extended page "${w.page}"`, dependencies: [`${wf}:extend:${slug}`], params: { page: slug, iteration: 1 } });
          }
          created.push(...(await this.tasks.create(list)));
        }
        break;
      }
      case 'project-summary':
        await this.ws.updateProject((p) => {
          p.status = 'completed';
        });
        break;
      default:
        break;
    }
    return created;
  }

  /**
   * Expansion that must exist BEFORE the task is marked completed, because completion immediately makes
   * dependents ready. A failing QA report must hold back the project summary until the fix loop is done.
   */
  async beforeComplete(task: Task): Promise<Task[]> {
    return task.type === 'design-qa' ? this.afterQA(task) : [];
  }

  private async afterQA(task: Task): Promise<Task[]> {
    const page = String(task.params.page ?? 'unknown');
    const iteration = Number(task.params.iteration ?? 1);
    const report = QAReportSchema.safeParse(await this.ws.readArtifactJson(TASK_CONTRACTS['design-qa'].artifactPath(task)));
    const max = this.ws.getProject().settings.maxQaIterations;
    if (!report.success || report.data.passed || iteration >= max || task.params.review) {
      await this.stage(STAGES.qa(page));
      return [];
    }
    const wf = task.workflowId ?? 'qa';
    const blocking = report.data.issues.filter((i) => i.severity === 'critical' || i.severity === 'major');
    const fixKey = `${wf}:fix:${page}:${iteration}`;
    const nextQa = `${wf}:qa:${page}:${iteration + 1}`;
    const created = await this.tasks.create([
      {
        idempotencyKey: fixKey, workflowId: wf, agent: 'figma-designer', type: 'figma-fix', priority: 55,
        title: `Fix QA issues on "${page}" (iteration ${iteration})`, dependencies: [task.taskId], scope: `figma:page:${page}`,
        params: { page, qaReport: TASK_CONTRACTS['design-qa'].artifactPath(task), issueIds: blocking.map((i) => i.issueId) },
        inputRefs: [TASK_CONTRACTS['design-qa'].artifactPath(task)],
      },
      { idempotencyKey: nextQa, workflowId: wf, agent: 'design-qa-agent', type: 'design-qa', priority: 50, title: `QA "${page}" (iteration ${iteration + 1})`, dependencies: [fixKey], params: { page, iteration: iteration + 1 } },
    ]);
    // Keep the summary waiting for the follow-up QA.
    const summary = (await this.tasks.list({ workflowId: wf, type: 'project-summary' })).find((t) => !isTerminal(t.status));
    const qa2 = created.find((t) => t.type === 'design-qa');
    if (summary && qa2) await this.tasks.addDependency(summary.taskId, qa2.taskId);
    return created;
  }

  private async stage(stage: string): Promise<void> {
    const state = await this.ws.getState();
    if (state.completedStages.includes(stage)) return;
    await this.ws.markStage(stage);
    const snapshot = (await this.tasks.list()).map((t) => ({ taskId: t.taskId, status: t.status, attempt: t.attempt }));
    await this.ws.createCheckpoint(stage, stage.replace(/[-:]/g, ' '), snapshot);
    this.log.info('stage completed', { stage });
  }

  /** Ready approval tasks are never run by agents: they wait for the user. */
  async promoteApprovals(): Promise<Task[]> {
    const out: Task[] = [];
    for (const t of await this.tasks.list({ status: ['ready'] })) {
      if ((APPROVAL_TYPES as readonly string[]).includes(t.type)) out.push(await this.tasks.transition(t.taskId, 'waiting_for_approval'));
    }
    return out;
  }

  async approve(taskId: string, opts: { choice?: string; note?: string; approved?: boolean } = {}): Promise<Task> {
    let task = await this.tasks.get(taskId);
    if (!(APPROVAL_TYPES as readonly string[]).includes(task.type)) throw new Error(`${taskId} is not an approval task`);
    if (task.status === 'ready') task = await this.tasks.transition(taskId, 'waiting_for_approval');
    if (task.status !== 'waiting_for_approval') throw new Error(`${taskId} is ${task.status}, not waiting for approval`);
    const approved = opts.approved ?? true;
    const rel = `feedback/approval-${taskId}.json`;
    await this.ws.writeArtifact(rel, { taskId, approved, choice: opts.choice ?? null, note: opts.note ?? '', at: nowIso() }, { kind: 'other', producedBy: 'user', taskId });
    if (task.type === 'concept-approval') {
      const proposed = (await this.memory.listDecisions({ status: ['proposed'] })).filter((d) => d.topic.startsWith('concept:'));
      for (const d of proposed) {
        const chosen = !opts.choice || d.decision.includes(opts.choice);
        await this.memory.setDecisionStatus(d.decisionId, approved && chosen ? 'accepted' : 'rejected');
      }
      if (opts.choice && approved && !proposed.some((d) => d.decision.includes(opts.choice!))) {
        await this.memory.recordDecision({ topic: 'concept:project', decision: opts.choice, rationale: opts.note ?? 'selected by the user', status: 'accepted', scope: 'project', source: 'user' });
      }
    } else {
      await this.memory.recordDecision({ topic: `approval:${String(task.params.subject ?? task.title)}`, decision: approved ? 'approved' : 'declined', rationale: opts.note ?? '', status: approved ? 'accepted' : 'rejected', scope: String(task.params.scope ?? 'project'), source: 'user' });
    }
    if (!approved) {
      const done = await this.tasks.transition(taskId, 'cancelled');
      return done;
    }
    const done = await this.tasks.transition(taskId, 'completed', { outputRefs: [rel], validation: { ok: true, errors: [], warnings: [], checkedAt: nowIso() } });
    await this.onTaskCompleted(done);
    return done;
  }

  /* ---------- Retry & reset (distinct from redesign and delete) ---------- */

  /** Retry: re-queue a failed (or cancelled) task with a fresh attempt budget. Same task, same inputs. */
  async retry(taskId: string): Promise<Task> {
    const t = await this.tasks.get(taskId);
    if (t.status !== 'failed') throw new Error(`${taskId} is ${t.status}; only failed tasks can be retried`);
    return this.tasks.transition(taskId, 'ready', { attempt: 0 });
  }

  /**
   * Reset: start the design process over inside the SAME project. Generated artifacts are archived (inside the
   * workspace), the task graph is superseded and stages are cleared. Kept: project identity and brief, assets,
   * memory (decisions/feedback), and Figma mappings so existing nodes are updated rather than duplicated.
   */
  async reset(reason: string): Promise<{ archived: string[]; superseded: number }> {
    const manifest = await this.ws.getManifest();
    const keep = (rel: string) => rel.startsWith('feedback/') || rel.startsWith('memory/') || rel === 'figma/mappings.json' || rel === 'figma/operations.jsonl' || rel === 'planning/brief.md';
    const archived = await this.ws.archiveArtifacts(Object.keys(manifest.artifacts).filter((r) => !keep(r)), `reset: ${reason}`);
    const open = (await this.tasks.list()).filter((t) => t.status !== 'superseded' && t.status !== 'running');
    const superseded = open.length ? await this.tasks.supersede(open.map((t) => t.taskId)) : [];
    await this.ws.updateState((st) => {
      st.completedStages = [];
    });
    await this.ws.updateProject((p) => {
      p.status = 'initialized';
    });
    await this.memory.recordDecision({ topic: 'project:reset', decision: 'design process reset', rationale: reason, status: 'accepted', scope: 'project', source: 'user' });
    return { archived, superseded: superseded.length };
  }

  /* ---------- Feedback ---------- */

  async vocabulary(): Promise<FeedbackVocabulary> {
    const a = await this.analysis();
    return {
      pages: (a?.sitemap ?? []).map((p) => ({ slug: p.slug, name: p.name })),
      sections: (a?.sitemap ?? []).flatMap((p) => p.sections.map((s) => ({ id: s.id, name: s.name, page: p.slug }))),
    };
  }

  async processFeedback(text: string, opts: { interpretation?: FeedbackInterpretation; persistence?: 'project' | 'global' } = {}): Promise<FeedbackOutcome> {
    const interp = opts.interpretation ?? interpretFeedback(text, await this.vocabulary());
    if (interp.needsClarification) {
      const feedback = await this.memory.recordFeedback(text, interp, { persistence: opts.persistence ?? 'project' });
      return { feedback, interpretation: interp, tasks: [], superseded: [], clarification: interp.clarificationQuestion ?? 'Please clarify the scope.' };
    }
    const wf = `feedback-${shortId()}`;
    const designed = await this.designedPages();
    const pages = interp.scope.pages.length ? interp.scope.pages : designed;
    const scopeLabel = interp.scope.sections.length ? `section:${interp.scope.sections.join('+')}` : interp.scope.pages.length ? `page:${interp.scope.pages.join('+')}` : interp.scope.level;
    const common = { feedback: text, attributes: interp.attributes, sections: interp.scope.sections, breakpoints: interp.scope.breakpoints, preserve: interp.preserve };
    const list: NewTask[] = [];
    let superseded: Task[] = [];

    switch (interp.intent) {
      case 'refine':
      case 'add':
        for (const page of pages) {
          list.push({ idempotencyKey: `${wf}:fix:${page}`, workflowId: wf, agent: 'figma-designer', type: 'figma-fix', priority: 70, title: `Apply feedback to "${page}": ${text.slice(0, 60)}`, scope: `figma:page:${page}`, params: { page, ...common, mode: interp.intent } });
          list.push({ idempotencyKey: `${wf}:qa:${page}:1`, workflowId: wf, agent: 'design-qa-agent', type: 'design-qa', priority: 60, title: `QA "${page}" after feedback`, dependencies: [`${wf}:fix:${page}`], params: { page, iteration: 1 } });
        }
        break;
      case 'review':
        for (const page of pages) list.push({ idempotencyKey: `${wf}:qa:${page}`, workflowId: wf, agent: 'design-qa-agent', type: 'design-qa', priority: 60, title: `Review "${page}"${interp.scope.breakpoints.length ? ` (${interp.scope.breakpoints.join(', ')})` : ''}`, params: { page, iteration: 1, review: true, ...common } });
        break;
      case 'redesign': {
        const prior = await this.memory.listDecisions({ status: ['accepted', 'proposed'] });
        const priorScoped = prior.filter((d) => d.scope === scopeLabel);
        for (const d of priorScoped) await this.memory.setDecisionStatus(d.decisionId, 'rejected');
        await this.memory.recordDecision({ topic: `direction:${scopeLabel}`, decision: `user rejected the current composition of ${scopeLabel}`, rationale: text, status: 'rejected', scope: scopeLabel, source: 'user', tags: ['rejected-direction'] });
        const category = interp.scope.sections[0] ?? interp.scope.pages[0] ?? 'page';
        superseded = await this.supersedeOpen((t) => (t.type === 'figma-fix' || t.type === 'figma-page-design' || t.type === 'asset-sourcing') && pages.includes(String(t.params.page)));
        list.push(
          { idempotencyKey: `${wf}:research:${category}`, workflowId: wf, agent: 'research-agent', type: 'research', priority: 75, title: `Research alternative approaches: ${category}`, params: { category, avoidRejected: true, request: text } },
          { idempotencyKey: `${wf}:visual-analysis:${category}`, workflowId: wf, agent: 'visual-analysis-agent', type: 'visual-analysis', priority: 72, title: `Analyze alternatives: ${category}`, dependencies: [`${wf}:research:${category}`], params: { category } },
          { idempotencyKey: `${wf}:concepts`, workflowId: wf, agent: 'creative-director', type: 'concept-generation', priority: 70, title: `New concept for ${scopeLabel} (different from the rejected one)`, dependencies: [`${wf}:visual-analysis:${category}`], params: { scope: scopeLabel, avoidRejected: true, ...common } },
        );
        for (const page of pages) {
          list.push(assetTask(`${wf}:assets:${page}`, wf, page, page, [`${wf}:concepts`], { scope: scopeLabel }));
          list.push({ idempotencyKey: `${wf}:redesign:${page}`, workflowId: wf, agent: 'figma-designer', type: 'figma-page-design', priority: 65, title: `Redesign ${scopeLabel} on "${page}"`, dependencies: [`${wf}:concepts`, `${wf}:assets:${page}`], scope: `figma:page:${page}`, params: { page, redesign: true, conceptScope: scopeLabel, ...common } });
          list.push({ idempotencyKey: `${wf}:qa:${page}:1`, workflowId: wf, agent: 'design-qa-agent', type: 'design-qa', priority: 60, title: `QA redesigned "${page}"`, dependencies: [`${wf}:redesign:${page}`], params: { page, iteration: 1 } });
        }
        break;
      }
      case 'new-concept':
      case 'reject-direction': {
        const accepted = (await this.memory.listDecisions({ status: ['accepted', 'proposed'] })).filter((d) => d.topic === 'concept:project');
        for (const d of accepted) await this.memory.setDecisionStatus(d.decisionId, 'rejected');
        const rwf = `redesign-${shortId()}`;
        superseded = await this.supersedeOpen((t) => ['concept-approval', 'design-system', 'figma-foundations', 'asset-sourcing', 'figma-page-design', 'figma-fix', 'design-qa', 'project-summary'].includes(t.type));
        const nConcepts = (await this.memory.listDecisions()).filter((d) => d.topic === 'concept:project').length;
        list.push({
          idempotencyKey: `${rwf}:research-plan`, workflowId: rwf, agent: 'research-agent', type: 'research-plan', priority: 80,
          title: 'Plan research for a different creative direction', description: `User feedback: ${text}`,
          params: { scope: 'project', avoidRejected: true, request: text },
        });
        await this.ws.writeArtifact(`planning/redesign-${rwf}.json`, { workflowId: rwf, reason: text, rejected: accepted.map((d) => d.decision), pageSuffix: `Concept ${nConcepts + 1}` }, { kind: 'other', producedBy: 'master-orchestrator' });
        break;
      }
      case 'remove': {
        const approvalKey = `${wf}:approval`;
        list.push({ idempotencyKey: approvalKey, workflowId: wf, agent: 'master-orchestrator', type: 'approval', priority: 90, title: `Confirm removal: ${scopeLabel}`, description: text, params: { subject: `remove ${scopeLabel}`, scope: scopeLabel, destructive: true } });
        for (const page of pages) list.push({ idempotencyKey: `${wf}:remove:${page}`, workflowId: wf, agent: 'figma-designer', type: 'figma-fix', priority: 70, title: `Remove ${scopeLabel} from "${page}"`, dependencies: [approvalKey], scope: `figma:page:${page}`, params: { page, ...common, mode: 'remove', authorizationKey: approvalKey } });
        break;
      }
      case 'approve': {
        const proposed = await this.memory.listDecisions({ status: ['proposed'] });
        for (const d of proposed) await this.memory.setDecisionStatus(d.decisionId, 'accepted');
        for (const t of await this.tasks.list({ status: ['waiting_for_approval'] })) await this.approve(t.taskId, { note: text });
        break;
      }
      case 'preserve':
        await this.memory.recordDecision({ topic: 'preserve', decision: `keep ${interp.preserve.join(', ') || scopeLabel} unchanged`, rationale: text, status: 'accepted', scope: scopeLabel, source: 'user' });
        break;
      case 'general':
        list.push({ idempotencyKey: `${wf}:interpret`, workflowId: wf, agent: 'master-orchestrator', type: 'feedback-interpretation', priority: 85, title: 'Interpret feedback and plan scoped work', description: text, params: { feedback: text } });
        break;
    }
    if (interp.preserve.length && interp.intent !== 'preserve') {
      await this.memory.recordDecision({ topic: 'preserve', decision: `keep ${interp.preserve.join(', ')} unchanged`, rationale: text, status: 'accepted', scope: scopeLabel, source: 'user' });
    }
    const tasks = list.length ? await this.tasks.create(list) : [];
    const feedback = await this.memory.recordFeedback(text, interp, { persistence: opts.persistence ?? 'project', createdTaskIds: tasks.map((t) => t.taskId) });
    await this.promoteApprovals();
    return { feedback, interpretation: interp, tasks, superseded };
  }

  private async supersedeOpen(pred: (t: Task) => boolean): Promise<Task[]> {
    const open = (await this.tasks.list()).filter((t) => !isTerminal(t.status) && t.status !== 'running' && pred(t));
    return open.length ? this.tasks.supersede(open.map((t) => t.taskId)) : [];
  }

  /* ---------- Context ---------- */

  /** Concise, task-specific context reconstructed from the workspace (never from chat history). */
  async contextPack(task?: Task): Promise<string> {
    const p = await this.ws.reloadProject();
    const state = await this.ws.getState();
    const manifest = await this.ws.getManifest();
    const decisions = await this.memory.activeDecisions();
    const rejected = await this.memory.rejectedDirections(typeof task?.params.conceptScope === 'string' ? task.params.conceptScope : undefined);
    const assumptions = (await this.memory.listAssumptions()).filter((a) => a.status === 'open');
    const feedback = (await this.memory.listFeedback()).slice(-5);
    const messages = task ? (await this.tasks.messages({ to: task.agent })).slice(-5) : [];
    const artifacts = Object.values(manifest.artifacts).filter((a) => !a.supersededBy).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 25);
    const lines = [
      `Project: ${p.name} (${p.projectId}) · status ${p.status} · mode ${p.mode}${p.existingDesignMode ? `/${p.existingDesignMode}` : ''}`,
      `Languages: ${p.languages.join(', ')} · direction ${p.direction}${p.industry ? ` · industry ${p.industry}` : ''}${p.market ? ` · market ${p.market}` : ''}`,
      `Settings: concept selection ${p.settings.conceptSelection}, breakpoints ${p.settings.breakpoints.join('/')}, themes ${p.settings.themes.join('/')}, QA iterations ≤ ${p.settings.maxQaIterations}`,
      p.figma.fileKey ? `Figma: ${p.figma.fileName ?? ''} (${p.figma.fileKey}); pages ${Object.keys(p.figma.pages).join(', ') || 'none yet'}` : 'Figma: not linked yet',
      `Completed stages: ${state.completedStages.join(', ') || 'none'}`,
      p.brief ? `\nBrief:\n${p.brief}` : '',
      decisions.length ? `\nActive decisions:\n${decisions.slice(-15).map((d) => `- [${d.status}] ${d.topic} (${d.scope}): ${d.decision}`).join('\n')}` : '',
      rejected.length ? `\nRejected directions (do not repeat):\n${rejected.slice(-10).map((d) => `- ${d.scope}: ${d.decision}${d.rationale ? ` — "${d.rationale}"` : ''}`).join('\n')}` : '',
      assumptions.length ? `\nOpen assumptions:\n${assumptions.slice(-10).map((a) => `- (${a.impact}) ${a.statement}`).join('\n')}` : '',
      feedback.length ? `\nRecent user feedback:\n${feedback.map((f) => `- "${f.text}" → ${f.interpretation.intent} (${f.interpretation.scope.level})`).join('\n')}` : '',
      messages.length ? `\nMessages for you:\n${messages.map((m) => `- from ${m.from} [${m.kind}]: ${m.body}`).join('\n')}` : '',
      artifacts.length ? `\nArtifacts (read with magec_artifact_read):\n${artifacts.map((a) => `- ${a.path} (${a.kind}, by ${a.producedBy})`).join('\n')}` : '',
      task ? `\nYour output must validate as ${TASK_CONTRACTS[task.type].schemaName} and is saved to ${TASK_CONTRACTS[task.type].artifactPath(task)}.` : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  /* ---------- Resume ---------- */

  async resume(): Promise<ResumeReport> {
    const validation = await this.ws.validate();
    const repairs = validation.ok ? await this.ws.repair() : [];
    await this.ws.beginSession();
    // Anything still "running" belongs to a session that no longer exists.
    const recovered = await this.tasks.recoverInterrupted({ olderThanMs: 0 });
    await this.promoteApprovals();
    const state = await this.ws.getState();
    const checkpoint = await this.ws.latestValidCheckpoint();
    const all = await this.tasks.list();
    const project = this.ws.getProject();
    return {
      projectId: this.ws.projectId,
      validation,
      repairs,
      recoveredTasks: recovered.map((t) => t.taskId),
      lastCheckpoint: checkpoint?.checkpointId ?? null,
      completedStages: state.completedStages,
      nextTasks: (await this.tasks.ready()).filter((t) => !(APPROVAL_TYPES as readonly string[]).includes(t.type)).slice(0, 10).map((t) => ({ taskId: t.taskId, agent: t.agent, title: t.title })),
      waitingForApproval: all.filter((t) => t.status === 'waiting_for_approval').map((t) => ({ taskId: t.taskId, title: t.title })),
      failed: all.filter((t) => t.status === 'failed').map((t) => ({ taskId: t.taskId, title: t.title, ...(t.errors.at(-1) ? { error: t.errors.at(-1)!.message } : {}) })),
      figmaLinked: Boolean(project.figma.fileKey),
    };
  }

  /* ---------- Autonomous loop ---------- */

  /**
   * Runs ready tasks with bounded concurrency until nothing is runnable, an approval is needed, or `maxTasks`
   * is reached. `execute` must leave the task completed or failed; anything else is recorded as a failure.
   */
  async runLoop(opts: { execute: (task: Task) => Promise<void>; concurrency?: number; maxTasks?: number; agents?: string[]; signal?: AbortSignal; onEvent?: (e: { type: string; task: Task }) => void }): Promise<{ executed: number; stoppedBecause: string }> {
    const concurrency = opts.concurrency ?? this.ws.getProject().settings.concurrency;
    const maxTasks = opts.maxTasks ?? 200;
    const running = new Map<string, Promise<void>>();
    let executed = 0;
    let stoppedBecause = 'no runnable tasks';
    while (executed < maxTasks) {
      if (opts.signal?.aborted) {
        stoppedBecause = 'aborted';
        break;
      }
      await this.promoteApprovals();
      const batch = (await this.tasks.schedule(concurrency))
        .filter((t) => !running.has(t.taskId) && !(APPROVAL_TYPES as readonly string[]).includes(t.type) && (!opts.agents || opts.agents.includes(t.agent)))
        .slice(0, Math.max(0, concurrency - running.size));
      if (!batch.length && !running.size) {
        const waiting = await this.tasks.list({ status: ['waiting_for_approval'] });
        if (waiting.length) stoppedBecause = `waiting for approval: ${waiting.map((t) => t.taskId).join(', ')}`;
        break;
      }
      for (const t of batch) {
        let claimed: Task;
        try {
          claimed = await this.tasks.claim(t.taskId, 'autonomous-runtime');
        } catch {
          continue;
        }
        executed++;
        opts.onEvent?.({ type: 'start', task: claimed });
        const p = (async () => {
          try {
            await opts.execute(claimed);
          } catch (err) {
            this.log.error('task execution crashed', { taskId: claimed.taskId, error: (err as Error).message });
          }
          const after = await this.tasks.get(claimed.taskId);
          if (after.status === 'running') {
            await this.tasks.fail(claimed.taskId, { message: 'agent finished without completing or failing the task', kind: 'technical', retryable: true });
          }
          const final = await this.tasks.get(claimed.taskId);
          opts.onEvent?.({ type: final.status, task: final });
        })().finally(() => running.delete(claimed.taskId));
        running.set(claimed.taskId, p);
      }
      if (running.size) await Promise.race(running.values());
      if (executed >= maxTasks) stoppedBecause = `task limit (${maxTasks}) reached`;
    }
    await Promise.all(running.values());
    return { executed, stoppedBecause };
  }
}

/** Maps a free-text research request to a category slug ("creative hero sections" -> "hero-section"). */
export function inferCategory(request: string): string {
  const t = request.toLowerCase();
  const known: Array<[RegExp, string]> = [
    [/hero/, 'hero-section'], [/(nav|menu|header)/, 'navigation'], [/footer/, 'footer'], [/(filter|facet)/, 'filters'],
    [/(search)/, 'search'], [/(checkout|payment)/, 'checkout'], [/(cart|basket)/, 'cart'], [/(product (card|tile)|listing card|property card|card)/, 'cards'],
    [/(gallery|carousel)/, 'gallery'], [/(pricing|plans)/, 'pricing'], [/(dashboard)/, 'dashboard'], [/(onboarding|sign ?up|register)/, 'onboarding'],
    [/(empty state)/, 'empty-states'], [/(form)/, 'forms'], [/(testimonial|review)/, 'testimonials'], [/(map)/, 'map'], [/(detail page|details)/, 'detail-page'],
    [/(هيرو|الواجهة)/, 'hero-section'], [/(بحث)/, 'search'], [/(فلتر|تصفية)/, 'filters'],
  ];
  for (const [re, cat] of known) if (re.test(t)) return cat;
  return slugify(t.split(/\s+/).slice(0, 4).join(' ')) || 'general';
}
