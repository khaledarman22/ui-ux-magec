import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'pending', 'ready', 'running', 'blocked', 'waiting_for_approval', 'completed', 'failed', 'cancelled', 'superseded',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TERMINAL_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled', 'superseded'];

export const TaskTypeSchema = z.enum([
  'product-analysis',
  'brand-analysis',
  'research-plan',
  'research',
  'visual-analysis',
  'concept-generation',
  'concept-approval',
  'design-system',
  'figma-foundations',
  'figma-page-design',
  'figma-fix',
  'design-qa',
  'asset-sourcing',
  'ux-audit',
  'figma-snapshot',
  'figma-reconcile',
  'feedback-interpretation',
  'approval',
  'checkpoint',
  'project-summary',
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const ValidationResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  checkedAt: z.string(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const TaskErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  /** Technical failures are retryable; creative rejection is not an error at all (it is feedback). */
  kind: z.enum(['technical', 'validation', 'permission', 'conflict', 'external', 'unknown']).default('unknown'),
  retryable: z.boolean().default(true),
  at: z.string(),
  attempt: z.number().int(),
});
export type TaskError = z.infer<typeof TaskErrorSchema>;

export const TaskSchema = z.object({
  taskId: z.string(),
  projectId: z.string(),
  agent: z.string(),
  type: TaskTypeSchema,
  title: z.string(),
  description: z.string().default(''),
  /** Workspace-relative paths or ids of inputs (artifacts, references, node ids). */
  inputRefs: z.array(z.string()).default([]),
  /** Structured, type-specific parameters (page slug, feature id, scope...). */
  params: z.record(z.string(), z.unknown()).default({}),
  dependencies: z.array(z.string()).default([]),
  priority: z.number().int().min(0).max(100).default(50),
  status: TaskStatusSchema,
  attempt: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  /** Lock scope for mutually exclusive work, e.g. `figma:page:home`. */
  scope: z.string().optional(),
  outputRefs: z.array(z.string()).default([]),
  validation: ValidationResultSchema.optional(),
  errors: z.array(TaskErrorSchema).default([]),
  workflowId: z.string().optional(),
  parentTaskId: z.string().optional(),
  supersededBy: z.string().optional(),
  /** Stable key that identifies "the same unit of work" so planning twice never duplicates tasks. */
  idempotencyKey: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  claimedBy: z.string().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const NewTaskSchema = TaskSchema.pick({
  agent: true, type: true, title: true, description: true, inputRefs: true, params: true, dependencies: true,
  priority: true, scope: true, workflowId: true, parentTaskId: true, idempotencyKey: true,
}).partial({ description: true, inputRefs: true, params: true, dependencies: true, priority: true, scope: true, workflowId: true, parentTaskId: true })
  .extend({ maxAttempts: z.number().int().min(1).optional() });
export type NewTask = z.input<typeof NewTaskSchema>;

export const AgentMessageSchema = z.object({
  messageId: z.string(),
  projectId: z.string(),
  from: z.string(),
  to: z.string(),
  taskId: z.string().optional(),
  kind: z.enum(['handoff', 'question', 'answer', 'result', 'revision-request', 'note']),
  body: z.string(),
  artifactRefs: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
