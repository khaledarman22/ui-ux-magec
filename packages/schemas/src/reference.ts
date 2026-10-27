import { z } from 'zod';

export const SourceAccessSchema = z.enum(['public-page', 'api-key', 'login-required', 'unsupported']);

export const ReferenceSchema = z.object({
  reference_id: z.string(),
  source: z.string(),
  source_url: z.string().url(),
  canonical_url: z.string(),
  /** Platform-specific id (behance gallery id, dribbble shot id) when derivable from the URL. */
  source_item_id: z.string().optional(),
  title: z.string().default(''),
  description: z.string().default(''),
  category: z.string(),
  industry: z.string().optional(),
  style: z.array(z.string()).default([]),
  layout: z.string().optional(),
  typography: z.string().optional(),
  color_direction: z.string().optional(),
  relevance_score: z.number().min(0).max(1).default(0),
  originality_score: z.number().min(0).max(1).optional(),
  usage_count: z.number().int().min(0).default(0),
  /** True only when the page was actually retrieved by the research fetcher. */
  verified: z.boolean(),
  verification: z.object({
    http_status: z.number().int().optional(),
    final_url: z.string().optional(),
    retrieved_at: z.string().optional(),
    method: z.enum(['fetch', 'host-browser', 'api']).optional(),
    failure: z.string().optional(),
  }).default({}),
  preview_url: z.string().optional(),
  /** Workspace-relative path (inside cache/) of a downloaded preview, kept for local analysis only. */
  preview_path: z.string().optional(),
  preview_hash: z.string().optional(),
  discovered_by: z.object({
    query: z.string().optional(),
    provider: z.string(),
    task_id: z.string().optional(),
  }),
  analysis_id: z.string().optional(),
  rejected: z.boolean().default(false),
  rejection_reason: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const ReferenceCandidateSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string(),
  query: z.string().optional(),
  style: z.array(z.string()).optional(),
  provider: z.string().default('host'),
});
export type ReferenceCandidate = z.infer<typeof ReferenceCandidateSchema>;

const Score = z.number().min(0).max(1);

export const ReferenceAnalysisSchema = z.object({
  analysis_id: z.string(),
  reference_id: z.string(),
  /** Whether a real image or page was inspected; analyses without inspection are rejected. */
  inspected: z.object({
    method: z.enum(['preview-image', 'live-page', 'screenshot']),
    artifact: z.string().optional(),
  }),
  layout_structure: z.string(),
  visual_hierarchy: z.string(),
  grid: z.string().optional(),
  typography: z.string(),
  color: z.string(),
  spacing: z.string().optional(),
  components: z.array(z.string()).default([]),
  imagery: z.string().optional(),
  navigation: z.string().optional(),
  interactions: z.string().optional(),
  responsive_notes: z.string().optional(),
  accessibility_concerns: z.array(z.string()).default([]),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).default([]),
  principles: z.array(z.string()).default([]),
  scores: z.object({ visual_appeal: Score, usability: Score, relevance: Score, originality: Score }),
  style: z.array(z.string()).default([]),
  layout_label: z.string().optional(),
  analyzed_by: z.string(),
  created_at: z.string(),
});
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>;
