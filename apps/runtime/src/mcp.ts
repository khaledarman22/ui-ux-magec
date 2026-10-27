import { createInterface } from 'node:readline';
import { toJsonSchema } from '@ui-ux-magec/agent-core';
import type { MagecRuntime } from './runtime.js';

const PROTOCOL_VERSION = '2025-06-18';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Minimal MCP server over stdio (JSON-RPC 2.0, newline-delimited): initialize, tools/list, tools/call, ping.
 * Each call may carry `as_agent`; permissions are enforced for that agent by the tool registry. Calls without
 * it act as the master orchestrator, which is the agent the user talks to.
 */
export class McpServer {
  constructor(private readonly rt: MagecRuntime, private readonly out: (line: string) => void = (l) => process.stdout.write(l + '\n')) {}

  private send(msg: unknown): void {
    this.out(JSON.stringify(msg));
  }

  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return this.rt.tools.list().map((t) => {
      const schema = toJsonSchema(t.input) as { properties?: Record<string, unknown>; [k: string]: unknown };
      return {
        name: t.name,
        description: `${t.description}${t.permissions.length ? ` [requires: ${t.permissions.join(', ')}]` : ''}`,
        inputSchema: {
          ...schema,
          type: 'object',
          properties: { ...(schema.properties ?? {}), as_agent: { type: 'string', description: 'Agent id you are acting as (e.g. figma-designer). Defaults to master-orchestrator.', enum: this.rt.agents.ids() } },
        },
      };
    });
  }

  async handle(req: JsonRpcRequest): Promise<void> {
    const reply = (result: unknown) => req.id !== undefined && this.send({ jsonrpc: '2.0', id: req.id, result });
    const error = (code: number, message: string) => req.id !== undefined && this.send({ jsonrpc: '2.0', id: req.id, error: { code, message } });
    switch (req.method) {
      case 'initialize':
        return void reply({
          protocolVersion: typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'ui-ux-magec', version: '0.1.0' },
          instructions: 'ui-ux-magec: local-first multi-agent UI/UX research, planning and Figma design. Start with magec_project_status. The project folder (.ui-ux-magec) is the source of truth.',
        });
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;
      case 'ping':
        return void reply({});
      case 'tools/list':
        return void reply({ tools: this.listTools() });
      case 'tools/call': {
        const name = String(req.params?.name ?? '');
        const args = { ...((req.params?.arguments as Record<string, unknown>) ?? {}) };
        const agentId = typeof args.as_agent === 'string' ? args.as_agent : 'master-orchestrator';
        delete args.as_agent;
        if (!this.rt.agents.get(agentId)) return void reply({ isError: true, content: [{ type: 'text', text: `unknown agent "${agentId}"` }] });
        if (!this.rt.hasProject) await this.rt.reload().catch(() => null);
        const result = await this.rt.tools.invoke(name, args, { agentId });
        const payload = result.ok ? result.result : { error: result.error };
        return void reply({ isError: !result.ok, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] });
      }
      default:
        return void error(-32601, `method not found: ${req.method}`);
    }
  }

  /** Serves requests from stdin until it closes. Requests are handled concurrently; responses carry their id. */
  serve(): Promise<void> {
    const rl = createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line) as JsonRpcRequest;
      } catch {
        this.send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
        return;
      }
      this.handle(req).catch((err: Error) => req.id !== undefined && this.send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: err.message } }));
    });
    return new Promise((resolve) => rl.on('close', () => resolve()));
  }
}
