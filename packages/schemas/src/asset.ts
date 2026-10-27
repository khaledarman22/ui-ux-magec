import { z } from 'zod';

/**
 * Licenses an asset may carry to be placed in a design. Inspiration references (Behance, Dribbble, ...) are
 * never assets: they are other people's work and only inform the design.
 */
export const AssetLicenseSchema = z.enum(['cc0', 'pdm', 'cc-by', 'cc-by-sa', 'unsplash', 'pexels', 'pixabay', 'mit', 'isc', 'apache-2.0', 'user-owned', 'generated']);
export type AssetLicense = z.infer<typeof AssetLicenseSchema>;

export const AssetRecordSchema = z.object({
  assetId: z.string(),
  kind: z.enum(['image', 'icon', 'reference']),
  /** Project-relative path, e.g. assets/images/hero-team.jpg. */
  path: z.string().regex(/^assets\//),
  purpose: z.string(),
  origin: z.enum(['generated', 'stock', 'icon-set', 'user', 'reference-preview']),
  license: AssetLicenseSchema.optional(),
  licenseUrl: z.string().optional(),
  author: z.string().optional(),
  authorUrl: z.string().optional(),
  sourcePage: z.string().optional(),
  provider: z.string().optional(),
  /** For generated images: which tool and prompt produced it. */
  generation: z.object({ tool: z.string(), prompt: z.string() }).optional(),
  referenceId: z.string().optional(),
  sha256: z.string(),
  mimeType: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  addedBy: z.string(),
  taskId: z.string().optional(),
  addedAt: z.string(),
});
export type AssetRecord = z.infer<typeof AssetRecordSchema>;

export const AssetLibrarySchema = z.object({ version: z.literal(1), assets: z.array(AssetRecordSchema) });
export type AssetLibrary = z.infer<typeof AssetLibrarySchema>;

/** asset-sourcing task output: every image/icon the page needs, and how each was obtained. */
export const AssetSourcingReportSchema = z.object({
  page: z.string(),
  strategy: z.object({
    imageGeneration: z.enum(['used', 'unavailable', 'not-needed']),
    note: z.string().optional(),
  }),
  images: z.array(z.object({ slot: z.string(), assetId: z.string(), path: z.string() })),
  icons: z.array(z.object({ slot: z.string(), assetId: z.string(), path: z.string() })),
  /** Slots that could not be filled with a permitted asset (the designer keeps a marked placeholder). */
  unresolved: z.array(z.object({ slot: z.string(), reason: z.string() })).default([]),
});
export type AssetSourcingReport = z.infer<typeof AssetSourcingReportSchema>;
