import { z } from 'zod';

export const DecisionSchema = z.object({
  decisionId: z.string(),
  projectId: z.string(),
  topic: z.string(),
  decision: z.string(),
  rationale: z.string().default(''),
  status: z.enum(['proposed', 'accepted', 'rejected', 'superseded']),
  /** Scope the decision applies to, e.g. `project`, `page:home`, `section:home/hero`. */
  scope: z.string().default('project'),
  source: z.enum(['user', 'agent']),
  agentId: z.string().optional(),
  referenceIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  supersedes: z.string().optional(),
  createdAt: z.string(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const AssumptionSchema = z.object({
  assumptionId: z.string(),
  projectId: z.string(),
  statement: z.string(),
  reason: z.string().default(''),
  impact: z.enum(['low', 'medium', 'high']).default('low'),
  status: z.enum(['open', 'confirmed', 'rejected']).default('open'),
  agentId: z.string().optional(),
  createdAt: z.string(),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const FeedbackIntentSchema = z.enum([
  'refine', 'redesign', 'new-concept', 'reject-direction', 'remove', 'preserve', 'review', 'approve', 'add', 'general',
]);
export type FeedbackIntent = z.infer<typeof FeedbackIntentSchema>;

export const FeedbackScopeSchema = z.object({
  level: z.enum(['project', 'page', 'section', 'component', 'breakpoint', 'design-system']),
  pages: z.array(z.string()).default([]),
  sections: z.array(z.string()).default([]),
  breakpoints: z.array(z.enum(['desktop', 'tablet', 'mobile'])).default([]),
});
export type FeedbackScope = z.infer<typeof FeedbackScopeSchema>;

export const FeedbackInterpretationSchema = z.object({
  intent: FeedbackIntentSchema,
  scope: FeedbackScopeSchema,
  attributes: z.array(z.string()).default([]),
  preserve: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  /** True when the instruction is destructive and ambiguous enough to require clarification. */
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().optional(),
});
export type FeedbackInterpretation = z.infer<typeof FeedbackInterpretationSchema>;

export const FeedbackSchema = z.object({
  feedbackId: z.string(),
  projectId: z.string(),
  text: z.string(),
  interpretation: FeedbackInterpretationSchema,
  /** `project` feedback stays inside this workspace; `global` only when the user explicitly asks for a reusable preference. */
  persistence: z.enum(['project', 'global']).default('project'),
  createdTaskIds: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const GlobalPreferenceSchema = z.object({
  key: z.string(),
  value: z.string(),
  note: z.string().default(''),
  createdAt: z.string(),
});
export type GlobalPreference = z.infer<typeof GlobalPreferenceSchema>;
