import { timingSafeEqual, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { BRIDGE_PROTOCOL_VERSION, BridgeHelloSchema, BridgeResponseSchema, type FigmaOperation } from '@ui-ux-magec/schemas';
import { silentLogger, type Logger } from '@ui-ux-magec/logger';
import { FigmaBridgeError } from './errors.js';
import type { BridgeStatus, PluginInfo } from './transport.js';

function tokenMatches(expected: string, given: unknown): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Local WebSocket hub between the agent runtime and the Figma plugin. Binds to 127.0.0.1 only and requires
 * the pairing token from both the plugin and any controller process. It relays structured operations only;
 * there is no code-execution or filesystem channel.
 */
export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private plugin: { socket: WebSocket; info: PluginInfo } | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly recent = new Map<string, unknown>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: { port: number; token: string; host?: string; log?: Logger }) {}

  private get log(): Logger {
    return this.opts.log ?? silentLogger;
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({
        host: this.opts.host ?? '127.0.0.1',
        port: this.opts.port,
        maxPayload: 24 * 1024 * 1024,
        verifyClient: ({ origin }: { origin?: string; req: IncomingMessage }) => !origin || origin === 'null' || origin.startsWith('https://www.figma.com') || origin.startsWith('app://'),
      });
      wss.once('error', reject);
      wss.once('listening', () => {
        wss.off('error', reject);
        wss.on('error', (err) => this.log.error('bridge server error', { error: err.message }));
        resolve();
      });
      wss.on('connection', (socket) => this.onConnection(socket));
      this.wss = wss;
    });
    const heartbeat = setInterval(() => {
      for (const client of this.wss?.clients ?? []) if (client.readyState === WebSocket.OPEN) client.ping();
    }, 15_000);
    // Don't keep the process alive just for heartbeats.
    (heartbeat as { unref?: () => void }).unref?.();
    this.heartbeat = heartbeat;
    this.log.info('bridge listening', { port: this.opts.port });
  }

  private onConnection(socket: WebSocket): void {
    let role: 'plugin' | 'controller' | null = null;
    const helloTimer = setTimeout(() => socket.close(4408, 'hello timeout'), 5000);
    socket.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        socket.close(4400, 'invalid json');
        return;
      }
      if (!role) {
        const hello = BridgeHelloSchema.safeParse(msg);
        if (!hello.success || !tokenMatches(this.opts.token, hello.data.token)) {
          this.log.warn('bridge auth failed');
          socket.send(JSON.stringify({ type: 'welcome', ok: false, error: 'authentication failed' }));
          socket.close(4401, 'unauthorized');
          return;
        }
        if (hello.data.protocol !== BRIDGE_PROTOCOL_VERSION) {
          socket.send(JSON.stringify({ type: 'welcome', ok: false, error: `protocol ${hello.data.protocol} unsupported (expected ${BRIDGE_PROTOCOL_VERSION})` }));
          socket.close(4426, 'protocol mismatch');
          return;
        }
        clearTimeout(helloTimer);
        role = hello.data.role;
        if (role === 'plugin') {
          if (!hello.data.plugin) {
            socket.close(4400, 'plugin info required');
            return;
          }
          if (this.plugin && this.plugin.socket !== socket) this.plugin.socket.close(4409, 'replaced by a newer plugin session');
          this.plugin = { socket, info: { ...hello.data.plugin, connectedAt: new Date().toISOString() } };
          this.log.info('plugin connected', { file: hello.data.plugin.fileName });
        }
        socket.send(JSON.stringify({ type: 'welcome', ok: true, status: this.statusSync() }));
        return;
      }
      if (role === 'plugin') this.onPluginMessage(msg);
      else void this.onControllerMessage(socket, msg);
    });
    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (role === 'plugin' && this.plugin?.socket === socket) {
        this.plugin = null;
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new FigmaBridgeError('not_connected', 'Figma plugin disconnected before responding'));
          this.pending.delete(id);
        }
        this.log.warn('plugin disconnected');
      }
    });
  }

  private onPluginMessage(msg: Record<string, unknown>): void {
    const res = BridgeResponseSchema.safeParse(msg);
    if (!res.success) return;
    const p = this.pending.get(res.data.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(res.data.id);
    if (res.data.ok) p.resolve(res.data.result);
    else {
      // Keep the plugin's error code when it is one we know (e.g. node_missing), so callers can react to it.
      const code = res.data.error?.code;
      const known = ['invalid_operation', 'unsupported_operation', 'node_missing', 'permission_denied', 'conflict'];
      p.reject(new FigmaBridgeError(code && known.includes(code) ? (code as 'node_missing') : 'plugin_error', res.data.error?.message ?? 'plugin error', res.data.error));
    }
  }

  private async onControllerMessage(socket: WebSocket, msg: Record<string, unknown>): Promise<void> {
    if (msg.type === 'status') {
      socket.send(JSON.stringify({ type: 'status', id: msg.id, status: this.statusSync() }));
      return;
    }
    if (msg.type !== 'request' || typeof msg.id !== 'string') return;
    try {
      const result = await this.request(msg.operation as FigmaOperation, { ...(typeof msg.idempotencyKey === 'string' ? { idempotencyKey: msg.idempotencyKey } : {}), ...(typeof msg.timeoutMs === 'number' ? { timeoutMs: msg.timeoutMs } : {}) });
      socket.send(JSON.stringify({ type: 'response', id: msg.id, ok: true, result }));
    } catch (err) {
      const e = err as FigmaBridgeError;
      socket.send(JSON.stringify({ type: 'response', id: msg.id, ok: false, error: { message: e.message, code: e.code ?? 'plugin_error' } }));
    }
  }

  statusSync(): BridgeStatus {
    return { connected: !!this.plugin, role: 'host', port: this.opts.port, ...(this.plugin ? { plugin: this.plugin.info } : {}) };
  }

  /** Sends an operation to the plugin. Responses for a repeated idempotency key are served from memory. */
  async request(operation: FigmaOperation, opts: { idempotencyKey?: string; timeoutMs?: number } = {}): Promise<unknown> {
    if (opts.idempotencyKey && this.recent.has(opts.idempotencyKey)) return this.recent.get(opts.idempotencyKey);
    const plugin = this.plugin;
    if (!plugin || plugin.socket.readyState !== WebSocket.OPEN) throw new FigmaBridgeError('not_connected', 'Figma plugin is not connected. Open Figma Desktop and run Plugins → Development → ui-ux-magec bridge.');
    if (!plugin.info.supportedOps.includes(operation.op)) throw new FigmaBridgeError('unsupported_operation', `plugin ${plugin.info.version} does not support "${operation.op}"`);
    const id = randomBytes(8).toString('hex');
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new FigmaBridgeError('timeout', `Figma did not respond to "${operation.op}" within ${opts.timeoutMs ?? 60_000}ms; the operation may or may not have been applied`));
      }, opts.timeoutMs ?? 60_000);
      this.pending.set(id, { resolve, reject, timer });
      plugin.socket.send(JSON.stringify({ type: 'request', id, operation, idempotencyKey: opts.idempotencyKey }));
    });
    if (opts.idempotencyKey) {
      this.recent.set(opts.idempotencyKey, result);
      if (this.recent.size > 200) this.recent.delete(this.recent.keys().next().value!);
    }
    return result;
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new FigmaBridgeError('not_connected', 'bridge closing'));
    }
    this.pending.clear();
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      for (const c of this.wss.clients) c.terminate();
      this.wss.close(() => resolve());
    });
    this.wss = null;
    this.plugin = null;
  }
}
