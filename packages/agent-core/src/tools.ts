import { z, type Permission } from '@ui-ux-magec/schemas';
import { silentLogger, type Logger } from '@ui-ux-magec/logger';

export interface ToolContext {
  agentId: string;
  taskId?: string;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  /** Every listed permission is required. */
  permissions: Permission[];
  handler: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

export type ToolErrorCode = 'unknown_tool' | 'permission_denied' | 'invalid_input' | 'failed';

export type ToolResult = { ok: true; result: unknown } | { ok: false; error: { code: ToolErrorCode; message: string; details?: unknown } };

export class PermissionDeniedError extends Error {
  constructor(public readonly agentId: string, public readonly tool: string, public readonly missing: Permission[]) {
    super(`agent "${agentId}" may not call ${tool} (missing: ${missing.join(', ')})`);
  }
}

/**
 * Runtime tool registry with permission enforcement. Skills never grant access: an agent can call a tool
 * only if its definition holds every permission the tool declares.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();
  constructor(private readonly permissionsOf: (agentId: string) => Set<Permission>, private readonly log: Logger = silentLogger) {}

  register(...defs: ToolDefinition<any>[]): void {
    for (const d of defs) {
      if (this.tools.has(d.name)) throw new Error(`duplicate tool ${d.name}`);
      this.tools.set(d.name, d as ToolDefinition);
    }
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  names(): Set<string> {
    return new Set(this.tools.keys());
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  missingPermissions(agentId: string, tool: ToolDefinition): Permission[] {
    const granted = this.permissionsOf(agentId);
    return tool.permissions.filter((p) => !granted.has(p));
  }

  allowedFor(agentId: string): ToolDefinition[] {
    return this.list().filter((t) => this.missingPermissions(agentId, t).length === 0);
  }

  async invoke(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: { code: 'unknown_tool', message: `unknown tool ${name}` } };
    const missing = this.missingPermissions(ctx.agentId, tool);
    if (missing.length) {
      this.log.warn('permission denied', { agent: ctx.agentId, tool: name, missing });
      return { ok: false, error: { code: 'permission_denied', message: new PermissionDeniedError(ctx.agentId, name, missing).message } };
    }
    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return { ok: false, error: { code: 'invalid_input', message: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') } };
    }
    try {
      const result = await tool.handler(parsed.data, ctx);
      this.log.debug('tool ok', { agent: ctx.agentId, tool: name });
      return { ok: true, result };
    } catch (err) {
      const e = err as Error & { details?: unknown };
      this.log.warn('tool failed', { agent: ctx.agentId, tool: name, error: e.message });
      return { ok: false, error: { code: 'failed', message: e.message, ...(e.details ? { details: e.details } : {}) } };
    }
  }

  jsonSchema(name: string): Record<string, unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`unknown tool ${name}`);
    return toJsonSchema(tool.input);
  }
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete js.$schema;
  if (js.type !== 'object') return { type: 'object', properties: {}, additionalProperties: true };
  return js;
}
