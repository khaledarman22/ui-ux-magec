import { z } from 'zod';
import { AssetSourcingReportSchema } from './asset.js';
import { DesignSystemSpecSchema } from './design.js';
import { FeedbackInterpretationSchema } from './memory.js';
import type { ArtifactKind } from './project.js';
import type { Task, TaskType } from './task.js';

/* ---------- Product analysis ---------- */

export const FeatureSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string(),
  description: z.string(),
  priority: z.enum(['must', 'should', 'could']),
  /** Every feature needs a product or UX justification; "competitors have it" is not one. */
  justification: z.string().min(10),
  pages: z.array(z.string()).default([]),
  /** Research categories worth investigating for this feature (e.g. `hero-section`, `property-filter`). */
  researchCategories: z.array(z.string()).default([]),
  states: z.array(z.enum(['loading', 'empty', 'error', 'success', 'hover', 'focus', 'disabled'])).default([]),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const SitemapPageSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string(),
  purpose: z.string(),
  sections: z.array(z.object({ id: z.string(), name: z.string(), purpose: z.string(), featureIds: z.array(z.string()).default([]) })).default([]),
  parent: z.string().optional(),
  priority: z.enum(['must', 'should', 'could']).default('must'),
});
export type SitemapPage = z.infer<typeof SitemapPageSchema>;

export const ProductAnalysisSchema = z.object({
  productType: z.string(),
  industry: z.string(),
  market: z.string().optional(),
  summary: z.string(),
  audiences: z.array(z.object({ name: z.string(), needs: z.array(z.string()), context: z.string().optional() })).min(1),
  roles: z.array(z.string()).default([]),
  features: z.array(FeatureSchema).min(1),
  mvpFeatureIds: z.array(z.string()).default([]),
  sitemap: z.array(SitemapPageSchema).min(1),
  userFlows: z.array(z.object({ id: z.string(), name: z.string(), actor: z.string(), steps: z.array(z.string()).min(2) })).default([]),
  businessRules: z.array(z.string()).default([]),
  languages: z.array(z.enum(['en', 'ar'])).min(1),
  direction: z.enum(['ltr', 'rtl', 'both']),
  assumptions: z.array(z.object({ statement: z.string(), reason: z.string(), impact: z.enum(['low', 'medium', 'high']) })).default([]),
  openQuestions: z.array(z.object({ question: z.string(), blocking: z.boolean() })).default([]),
});
export type ProductAnalysis = z.infer<typeof ProductAnalysisSchema>;

/* ---------- Brand ---------- */

export const BrandAnalysisSchema = z.object({
  assetsInspected: z.array(z.string()),
  established: z.boolean(),
  personality: z.array(z.string()).min(1),
  colors: z.array(z.object({ hex: z.string(), role: z.string(), source: z.enum(['extracted', 'proposed']) })).min(1),
  typography: z.array(z.object({ family: z.string(), usage: z.string(), source: z.enum(['extracted', 'proposed']), supportsArabic: z.boolean().optional() })),
  rules: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  proposedDecisions: z.array(z.string()).default([]),
});
export type BrandAnalysis = z.infer<typeof BrandAnalysisSchema>;

/* ---------- Research ---------- */

export const ResearchQuerySchema = z.object({
  query: z.string().min(3),
  category: z.string(),
  featureId: z.string().optional(),
  sources: z.array(z.string()).min(1),
  styleAngle: z.string().optional(),
});
export type ResearchQuery = z.infer<typeof ResearchQuerySchema>;

export const ResearchPlanSchema = z.object({
  goal: z.string(),
  queries: z.array(ResearchQuerySchema).min(1),
  avoid: z.array(z.string()).default([]),
});
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

export const ResearchReportSchema = z.object({
  category: z.string(),
  summary: z.string(),
  referenceIds: z.array(z.string()),
  sourcesTried: z.array(z.object({ source: z.string(), status: z.enum(['ok', 'empty', 'blocked', 'login-required', 'error', 'skipped']), note: z.string().optional() })).min(1),
  insights: z.array(z.string()).default([]),
  approaches: z.array(z.object({ name: z.string(), description: z.string(), referenceIds: z.array(z.string()) })).default([]),
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;

export const VisualAnalysisReportSchema = z.object({
  category: z.string(),
  analysisIds: z.array(z.string()).min(1),
  patterns: z.array(z.object({ name: z.string(), description: z.string(), referenceIds: z.array(z.string()) })).min(1),
  usabilityVsAppeal: z.string(),
  recommendations: z.array(z.string()).default([]),
});
export type VisualAnalysisReport = z.infer<typeof VisualAnalysisReportSchema>;

/* ---------- Concepts ---------- */

export const ConceptSchema = z.object({
  conceptId: z.string(),
  name: z.string(),
  philosophy: z.string(),
  audienceFit: z.string(),
  color: z.string(),
  typography: z.string(),
  layout: z.string(),
  interaction: z.string(),
  imagery: z.string().optional(),
  motion: z.string().optional(),
  advantages: z.array(z.string()).min(1),
  disadvantages: z.array(z.string()).min(1),
  referenceIds: z.array(z.string()).default([]),
  originalityNotes: z.string(),
});
export type Concept = z.infer<typeof ConceptSchema>;

export const ConceptSetSchema = z.object({
  scope: z.string().default('project'),
  concepts: z.array(ConceptSchema).min(1),
  recommendedConceptId: z.string(),
  recommendationRationale: z.string(),
  rejectedReferenceIds: z.array(z.string()).default([]),
  avoided: z.array(z.string()).default([]),
});
export type ConceptSet = z.infer<typeof ConceptSetSchema>;

/* ---------- Figma write report ---------- */

export const FigmaWriteReportSchema = z.object({
  specPath: z.string().optional(),
  operationIds: z.array(z.string()),
  nodes: z.array(z.object({ logicalId: z.string(), nodeId: z.string(), action: z.enum(['created', 'updated', 'unchanged']) })),
  previews: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  unsupported: z.array(z.string()).default([]),
});
export type FigmaWriteReport = z.infer<typeof FigmaWriteReportSchema>;

/* ---------- QA & audit ---------- */

export const QAIssueSchema = z.object({
  issueId: z.string(),
  rule: z.string(),
  severity: z.enum(['critical', 'major', 'minor', 'info']),
  message: z.string(),
  nodeId: z.string().optional(),
  logicalId: z.string().optional(),
  screen: z.string().optional(),
  evidence: z.string().optional(),
  suggestion: z.string().optional(),
  source: z.enum(['structural', 'visual']),
});
export type QAIssue = z.infer<typeof QAIssueSchema>;

export const QAReportSchema = z.object({
  scope: z.string(),
  iteration: z.number().int().min(1),
  structuralChecks: z.array(z.object({ rule: z.string(), status: z.enum(['passed', 'failed', 'skipped']), note: z.string().optional() })),
  visualReview: z.object({
    performed: z.boolean(),
    previews: z.array(z.string()).default([]),
    notes: z.string().optional(),
  }),
  issues: z.array(QAIssueSchema),
  passed: z.boolean(),
  remainingLimitations: z.array(z.string()).default([]),
});
export type QAReport = z.infer<typeof QAReportSchema>;

export const UXAuditReportSchema = z.object({
  mode: z.enum(['audit', 'suggest', 'extend']),
  inspected: z.object({ pages: z.array(z.string()), frames: z.number().int(), components: z.number().int() }),
  existingSystem: z.object({ colors: z.array(z.string()), typography: z.array(z.string()), components: z.array(z.string()) }),
  flows: z.array(z.object({ name: z.string(), status: z.enum(['complete', 'incomplete', 'missing']), notes: z.string().optional() })),
  gaps: z.array(z.object({
    id: z.string(),
    kind: z.enum(['missing-screen', 'missing-state', 'inconsistency', 'navigation', 'accessibility', 'content', 'other']),
    description: z.string(),
    severity: z.enum(['critical', 'major', 'minor']),
    location: z.string().optional(),
    recommendation: z.string(),
  })),
  proposedWork: z.array(z.object({ title: z.string(), page: z.string().optional(), rationale: z.string() })).default([]),
});
export type UXAuditReport = z.infer<typeof UXAuditReportSchema>;

export const ProjectSummarySchema = z.object({
  summary: z.string(),
  completed: z.array(z.string()),
  outstanding: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  figmaLinks: z.array(z.string()).default([]),
});

/* ---------- Contract registry ---------- */

export interface TaskContract {
  schema: z.ZodType | null;
  schemaName: string;
  kind: ArtifactKind;
  /** Workspace-relative path for the primary output artifact. */
  artifactPath: (task: Pick<Task, 'taskId' | 'params'>) => string;
}

const p = (task: Pick<Task, 'params'>, key: string, fallback = 'all') => {
  const v = task.params[key];
  return typeof v === 'string' && v ? v.replace(/[^a-z0-9-]/gi, '-').toLowerCase() : fallback;
};

export const TASK_CONTRACTS: Record<TaskType, TaskContract> = {
  'product-analysis': { schema: ProductAnalysisSchema, schemaName: 'ProductAnalysis', kind: 'product-analysis', artifactPath: () => 'planning/product-analysis.json' },
  'brand-analysis': { schema: BrandAnalysisSchema, schemaName: 'BrandAnalysis', kind: 'brand-analysis', artifactPath: () => 'planning/brand-analysis.json' },
  'research-plan': { schema: ResearchPlanSchema, schemaName: 'ResearchPlan', kind: 'research-plan', artifactPath: (t) => `research/plan-${p(t, 'scope', 'project')}.json` },
  research: { schema: ResearchReportSchema, schemaName: 'ResearchReport', kind: 'research-report', artifactPath: (t) => `research/report-${p(t, 'category')}.json` },
  'visual-analysis': { schema: VisualAnalysisReportSchema, schemaName: 'VisualAnalysisReport', kind: 'reference-analysis', artifactPath: (t) => `research/visual-analysis-${p(t, 'category')}.json` },
  'concept-generation': { schema: ConceptSetSchema, schemaName: 'ConceptSet', kind: 'concepts', artifactPath: (t) => `concepts/concepts-${p(t, 'scope', 'project')}-${t.taskId.slice(-6)}.json` },
  'concept-approval': { schema: null, schemaName: 'none', kind: 'other', artifactPath: (t) => `concepts/approval-${t.taskId}.json` },
  'design-system': { schema: DesignSystemSpecSchema, schemaName: 'DesignSystemSpec', kind: 'design-system', artifactPath: () => 'design-system/design-system.json' },
  'figma-foundations': { schema: FigmaWriteReportSchema, schemaName: 'FigmaWriteReport', kind: 'other', artifactPath: () => 'figma/reports/foundations.json' },
  'figma-page-design': { schema: FigmaWriteReportSchema, schemaName: 'FigmaWriteReport', kind: 'other', artifactPath: (t) => `figma/reports/page-${p(t, 'page')}.json` },
  'figma-fix': { schema: FigmaWriteReportSchema, schemaName: 'FigmaWriteReport', kind: 'other', artifactPath: (t) => `figma/reports/fix-${t.taskId}.json` },
  'asset-sourcing': { schema: AssetSourcingReportSchema, schemaName: 'AssetSourcingReport', kind: 'asset-report', artifactPath: (t) => `reports/assets-${p(t, 'page')}.json` },
  'design-qa': { schema: QAReportSchema, schemaName: 'QAReport', kind: 'qa-report', artifactPath: (t) => `reports/qa-${p(t, 'page')}-${t.taskId.slice(-6)}.json` },
  'ux-audit': { schema: UXAuditReportSchema, schemaName: 'UXAuditReport', kind: 'ux-audit', artifactPath: () => 'reports/ux-audit.json' },
  'figma-snapshot': { schema: null, schemaName: 'none', kind: 'other', artifactPath: () => 'figma/snapshot.json' },
  'figma-reconcile': { schema: null, schemaName: 'none', kind: 'other', artifactPath: () => 'figma/reconcile.json' },
  'feedback-interpretation': { schema: FeedbackInterpretationSchema, schemaName: 'FeedbackInterpretation', kind: 'feedback-interpretation', artifactPath: (t) => `feedback/interpretation-${t.taskId}.json` },
  approval: { schema: null, schemaName: 'none', kind: 'other', artifactPath: (t) => `tasks/approval-${t.taskId}.json` },
  checkpoint: { schema: null, schemaName: 'none', kind: 'other', artifactPath: (t) => `checkpoints/${t.taskId}.json` },
  'project-summary': { schema: ProjectSummarySchema, schemaName: 'ProjectSummary', kind: 'summary', artifactPath: () => 'reports/summary.json' },
};
