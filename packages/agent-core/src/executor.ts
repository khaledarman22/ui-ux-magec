import { readFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import type { AgentDefinition, Task } from '@ui-ux-magec/schemas';
import { silentLogger, type Logger } from '@ui-ux-magec/logger';
import { toJsonSchema, type ToolDefinition, type ToolResult } from './tools.js';

export interface AgentRunRequest {
  agent: AgentDefinition;
  task: Task;
  systemPrompt: string;
  taskPrompt: string;
  tools: ToolDefinition[];
  invoke: (name: string, input: unknown) => Promise<ToolResult>;
  /** Local images (reference previews, Figma exports) attached for visual inspection. */
  images?: Array<{ path: string; mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' }>;
  maxTurns?: number;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  status: 'ended' | 'max_turns' | 'refused' | 'error';
  finalText: string;
  turns: number;
  toolCalls: number;
  error?: string;
}

/** Executes one agent task. The agent reports its outcome through task tools, not the return value. */
export interface AgentExecutor {
  readonly name: string;
  readonly available: boolean;
  run(req: AgentRunRequest): Promise<AgentRunResult>;
}

/**
 * Host-driven mode: a coding assistant (Claude Code, Codex, OpenCode) performs the task through the MCP
 * server. The runtime does not call any model itself.
 */
export class HostExecutor implements AgentExecutor {
  readonly name = 'host';
  readonly available = false;
  async run(): Promise<AgentRunResult> {
    return { status: 'error', finalText: '', turns: 0, toolCalls: 0, error: 'host executor: tasks are performed by the connected coding assistant via MCP' };
  }
}

const EFFORT: Record<AgentDefinition['model']['tier'], 'low' | 'medium' | 'high'> = { fast: 'low', balanced: 'medium', deep: 'high' };

export interface AnthropicExecutorOptions {
  model?: string;
  maxTokens?: number;
  log?: Logger;
  client?: Anthropic;
}

/**
 * Autonomous mode: runs the agent loop against the Claude API with the agent's permission-filtered tools.
 * Model depth is controlled by effort per agent tier; the model itself is configurable (MAGEC_MODEL).
 */
export class AnthropicExecutor implements AgentExecutor {
  readonly name = 'anthropic';
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly log: Logger;

  constructor(opts: AnthropicExecutorOptions = {}) {
    this.model = opts.model ?? process.env.MAGEC_MODEL ?? 'claude-opus-5-5';
    this.maxTokens = opts.maxTokens ?? 16000;
    this.log = opts.log ?? silentLogger;
    this.client = opts.client ?? (hasAnthropicCredentials() ? new Anthropic() : null);
  }

  get available(): boolean {
    return this.client !== null;
  }

  async run(req: AgentRunRequest): Promise<AgentRunResult> {
    if (!this.client) return { status: 'error', finalText: '', turns: 0, toolCalls: 0, error: 'no Anthropic credentials (set ANTHROPIC_API_KEY or run `ant auth login`)' };
    const tools: Anthropic.Beta.BetaTool[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: toJsonSchema(t.input) as Anthropic.Beta.BetaTool['input_schema'],
    }));
    const firstContent: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const img of req.images ?? []) {
      const data = (await readFile(img.path)).toString('base64');
      firstContent.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data } });
    }
    firstContent.push({ type: 'text', text: req.taskPrompt });
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: firstContent }];
    const maxTurns = req.maxTurns ?? 40;
    let toolCalls = 0;
    let finalText = '';

    for (let turn = 1; turn <= maxTurns; turn++) {
      if (req.signal?.aborted) return { status: 'error', finalText, turns: turn - 1, toolCalls, error: 'aborted' };
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: [{ type: 'text', text: req.systemPrompt, cache_control: { type: 'ephemeral' } }],
          tools,
          tool_choice: { type: 'auto' },
          thinking: { type: 'adaptive' },
          output_config: { effort: EFFORT[req.agent.model.tier] },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          messages,
        }, { signal: req.signal });
      } catch (err) {
        const message = err instanceof Anthropic.APIError ? `Claude API ${err.status ?? ''}: ${err.message}` : (err as Error).message;
        this.log.error('model call failed', { task: req.task.taskId, error: message });
        return { status: 'error', finalText, turns: turn, toolCalls, error: message };
      }
      messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
      const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n');
      if (text) finalText = text;

      if (response.stop_reason === 'refusal') return { status: 'refused', finalText, turns: turn, toolCalls, error: 'model declined the request' };
      if (response.stop_reason === 'max_tokens') {
        messages.push({ role: 'user', content: 'Your last response hit the output limit. Continue, keeping tool inputs smaller (split large specs into several calls).' });
        continue;
      }
      const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || uses.length === 0) {
        if (response.stop_reason === 'pause_turn') continue;
        return { status: 'ended', finalText, turns: turn, toolCalls };
      }
      // Parallel tool calls run concurrently; all results go back in a single user message.
      const results = await Promise.all(uses.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        toolCalls++;
        const r = await req.invoke(u.name, u.input);
        return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r.ok ? r.result : r.error).slice(0, 100_000), is_error: !r.ok };
      }));
      messages.push({ role: 'user', content: results });
    }
    return { status: 'max_turns', finalText, turns: maxTurns, toolCalls };
  }
}

export function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}
