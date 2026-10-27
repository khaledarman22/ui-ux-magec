import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const LanguageSchema = z.enum(['en', 'ar']);
export const DirectionSchema = z.enum(['ltr', 'rtl', 'both']);

export const ProjectStatusSchema = z.enum(['initialized', 'planning', 'researching', 'designing', 'reviewing', 'paused', 'completed']);
export const ProjectModeSchema = z.enum(['new', 'existing']);
export const ExistingDesignModeSchema = z.enum(['audit', 'suggest', 'extend']);

export const FigmaLinkSchema = z.object({
  fileKey: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  /** Page name -> page node id, discovered or created by the bridge. */
  pages: z.record(z.string(), z.string()).default({}),
  lastSyncedAt: z.string().optional(),
});

export const ProjectSettingsSchema = z.object({
  /** Who selects the creative concept: the creative director (recorded as an agent decision) or the user. */
  conceptSelection: z.enum(['auto', 'user']).default('auto'),
  maxQaIterations: z.number().int().min(0).max(10).default(3),
  maxTaskAttempts: z.number().int().min(1).max(10).default(3),
  concurrency: z.number().int().min(1).max(8).default(2),
  breakpoints: z.array(z.enum(['desktop', 'tablet', 'mobile'])).default(['desktop', 'mobile']),
  themes: z.array(z.enum(['light', 'dark'])).default(['light']),
  researchSources: z.array(z.string()).default([]),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  projectId: z.string().regex(/^prj_[a-z0-9]+$/),
  name: z.string().min(1),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  brief: z.string().default(''),
  mode: ProjectModeSchema.default('new'),
  existingDesignMode: ExistingDesignModeSchema.optional(),
  languages: z.array(LanguageSchema).min(1).default(['en']),
  direction: DirectionSchema.default('ltr'),
  industry: z.string().optional(),
  market: z.string().optional(),
  status: ProjectStatusSchema.default('initialized'),
  figma: FigmaLinkSchema.default({ pages: {} }),
  settings: ProjectSettingsSchema.default(ProjectSettingsSchema.parse({})),
});
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ArtifactKindSchema = z.enum([
  'requirements', 'product-analysis', 'sitemap', 'brand-analysis', 'research-plan', 'research-report',
  'reference-analysis', 'concepts', 'design-system', 'design-spec', 'qa-report', 'ux-audit', 'feedback-interpretation',
  'summary', 'preview', 'asset-report', 'other',
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ManifestEntrySchema = z.object({
  path: z.string(),
  kind: ArtifactKindSchema,
  hash: z.string(),
  updatedAt: z.string(),
  producedBy: z.string(),
  taskId: z.string().optional(),
  supersededBy: z.string().optional(),
});
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

export const ManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  projectId: z.string(),
  createdAt: z.string(),
  /** Keyed by workspace-relative artifact path. */
  artifacts: z.record(z.string(), ManifestEntrySchema).default({}),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const ProjectStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  projectId: z.string(),
  phase: z.string().default('initialized'),
  lastCheckpointId: z.string().optional(),
  sessionCount: z.number().int().default(0),
  lastSessionAt: z.string().optional(),
  updatedAt: z.string(),
  /** Completed workflow stages, used to avoid repeating research or design. */
  completedStages: z.array(z.string()).default([]),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;

export const CheckpointSchema = z.object({
  checkpointId: z.string(),
  projectId: z.string(),
  stage: z.string(),
  label: z.string(),
  createdAt: z.string(),
  taskSnapshot: z.array(z.object({ taskId: z.string(), status: z.string(), attempt: z.number() })),
  manifestHash: z.string(),
  /** Files copied into the checkpoint directory (workspace-relative). */
  files: z.array(z.string()),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;
