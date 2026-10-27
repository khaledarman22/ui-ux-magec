import { z } from 'zod';

export const CacheCategorySchema = z.enum([
  'research-results', 'reference-metadata', 'reference-previews', 'visual-analysis', 'figma-metadata',
  'figma-nodes', 'asset-processing', 'agent-temp', 'rendered-previews', 'robots',
]);
export type CacheCategory = z.infer<typeof CacheCategorySchema>;

export const CacheEntrySchema = z.object({
  key: z.string(),
  category: CacheCategorySchema,
  source: z.string(),
  createdAt: z.string(),
  /** Absolute expiry; undefined means "valid until a dependency invalidates it". */
  expiresAt: z.string().optional(),
  contentVersion: z.number().int().default(1),
  contentHash: z.string(),
  validation: z.enum(['valid', 'stale', 'invalid']).default('valid'),
  dependencies: z.array(z.string()).default([]),
  /** File holding the payload, relative to the cache category directory. */
  payloadFile: z.string(),
  binary: z.boolean().default(false),
});
export type CacheEntry = z.infer<typeof CacheEntrySchema>;
