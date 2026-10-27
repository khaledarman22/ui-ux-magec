import { z } from 'zod';

/**
 * Permissions are deliberately independent of skills: a skill describes *how* to do something,
 * a permission decides whether an agent may call the tools that do it.
 */
export const PermissionSchema = z.enum([
  'workspace.read',
  'workspace.write',
  'memory.write',
  'tasks.read',
  'tasks.self',
  'tasks.manage',
  'approvals.request',
  'research.network',
  'references.write',
  'figma.read',
  'figma.write',
  'figma.delete',
  'figma.export',
  'qa.write',
  'assets.write',
  'project.destructive',
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const ContractFieldSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** Name of a schema in @ui-ux-magec/schemas, or a workspace path pattern. */
  schema: z.string().optional(),
});

export const AgentDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  kind: z.enum(['orchestrator', 'specialist']),
  description: z.string(),
  responsibilities: z.array(z.string()).min(1),
  skills: z.object({
    shared: z.array(z.string()).default([]),
    specialized: z.array(z.string()).default([]),
  }),
  permissions: z.array(PermissionSchema),
  /** Host-platform tools the agent may use in addition to runtime tools (e.g. WebSearch, Read for images). */
  hostTools: z.array(z.string()).default([]),
  taskTypes: z.array(z.string()).default([]),
  inputs: z.array(ContractFieldSchema).default([]),
  outputs: z.array(ContractFieldSchema).default([]),
  model: z.object({ tier: z.enum(['fast', 'balanced', 'deep']).default('balanced') }).default({ tier: 'balanced' }),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const SkillFrontmatterSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  description: z.string().min(10),
  category: z.enum(['shared', 'specialized']),
  /** Specialized skills list the agents they belong to; shared skills may be used by any agent. */
  agents: z.array(z.string()).default([]),
  /** Runtime tools the skill's instructions call. Listing a tool here grants nothing. */
  tools: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
