import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { BRIDGE_PROTOCOL_VERSION, FigmaOperationSchema, type FigmaOperation, type FigmaOperationInput } from '@ui-ux-magec/schemas';
import { silentLogger, type Logger } from '@ui-ux-magec/logger';
import { bridgeSettings } from './config.js';
import { FigmaBridgeError } from './errors.js';
import { BridgeServer } from './server.js';
import type { BridgeStatus, FigmaTransport } from './transport.js';

/**
 * Connects this process to the bridge: it hosts the WebSocket server if the port is free, otherwise it joins
 * the existing host (e.g. the MCP server) as an authenticated controller. Either way callers get one API.
 */
export class BridgeConnection implements FigmaTransport {
  private server: BridgeServer | null = null;
  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private starting: Promise<void> | null = null;

  constructor(private readonly opts: { port: number; token: string; log?: Logger; hostOnly?: boolean }) {}

  static fromConfig(log?: Logger): BridgeConnection | null {
    const s = bridgeSettings();
    return s ? new BridgeConnection({ ...s, ...(log ? { log } : {}) }) : null;
  }

  private get log(): Logger {
    return this.opts.log ?? silentLogger;
  }

  async start(): Promise<void> {
    this.starting ??= this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<void> {
    const server = new BridgeServer({ port: this.opts.port, token: this.opts.token, log: this.log });
    try {
      await server.listen();
      this.server = server;
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || this.opts.hostOnly) throw err;
    }
    await this.connectAsController();
  }

  private async connectAsController(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${this.opts.port}`);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new FigmaBridgeError('not_connected', `bridge port ${this.opts.port} is in use but no bridge answered`));
      }, 5000);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', role: 'controller', token: this.opts.token, protocol: BRIDGE_PROTOCOL_VERSION })));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg.type === 'welcome') {
          clearTimeout(timer);
          if (msg.ok) {
            this.socket = ws;
            resolve();
          } else {
            reject(new FigmaBridgeError('auth_failed', String(msg.error ?? 'bridge rejected the token')));
          }
          return;
        }
        if ((msg.type === 'response' || msg.type === 'status') && typeof msg.id === 'string') {
          const p = this.pending.get(msg.id);
          if (!p) return;
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          if (msg.type === 'status') p.resolve(msg.status);
          else if (msg.ok) p.resolve(msg.result);
          else {
            const e = msg.error as { message: string; code?: string };
            p.reject(new FigmaBridgeError((e.code as never) ?? 'plugin_error', e.message));
          }
        }
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(new FigmaBridgeError('not_connected', `cannot reach bridge: ${err.message}`));
      });
      ws.on('close', () => {
        this.socket = null;
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new FigmaBridgeError('not_connected', 'bridge connection closed'));
        }
        this.pending.clear();
        this.starting = null;
      });
    });
  }

  private send(payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new FigmaBridgeError('not_connected', 'not connected to bridge'));
    const id = randomBytes(8).toString('hex');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new FigmaBridgeError('timeout', 'bridge did not respond in time; the operation may or may not have been applied'));
      }, timeoutMs + 2000);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ ...payload, id }));
    });
  }

  async status(): Promise<BridgeStatus> {
    try {
      await this.start();
    } catch (err) {
      return { connected: false, role: 'none', port: this.opts.port, detail: (err as Error).message };
    }
    if (this.server) return this.server.statusSync();
    const s = (await this.send({ type: 'status' }, 5000)) as BridgeStatus;
    return { ...s, role: 'controller' };
  }

  async request(operation: FigmaOperation | FigmaOperationInput, opts: { idempotencyKey?: string; timeoutMs?: number } = {}): Promise<unknown> {
    const parsed = FigmaOperationSchema.safeParse(operation);
    if (!parsed.success) throw new FigmaBridgeError('invalid_operation', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    await this.start();
    if (this.server) return this.server.request(parsed.data, opts);
    return this.send({ type: 'request', operation: parsed.data, ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}), timeoutMs: opts.timeoutMs ?? 60_000 }, opts.timeoutMs ?? 60_000);
  }

  async waitForPlugin(timeoutMs: number): Promise<BridgeStatus> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const s = await this.status();
      if (s.connected || Date.now() > deadline) return s;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async close(): Promise<void> {
    this.socket?.close();
    this.socket = null;
    await this.server?.close();
    this.server = null;
    this.starting = null;
  }
}

/** Transport used when Figma is not configured: every call fails with an accurate reason. */
export class UnavailableTransport implements FigmaTransport {
  constructor(private readonly reason: string) {}
  async status(): Promise<BridgeStatus> {
    return { connected: false, role: 'none', detail: this.reason };
  }
  async request(): Promise<unknown> {
    throw new FigmaBridgeError('not_configured', this.reason);
  }
  async close(): Promise<void> {}
}
