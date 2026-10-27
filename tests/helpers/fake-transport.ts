/**
 * MOCK — a FigmaTransport that runs the real plugin executor against FakeFigma in-process (no WebSocket, no
 * Figma). Supports fault injection to simulate failed or interrupted writes.
 */
import { FigmaOperationSchema, type FigmaOperation } from '@ui-ux-magec/schemas';
import { FigmaBridgeError, type BridgeStatus, type FigmaTransport } from '@ui-ux-magec/figma-bridge';
import { createExecutor, OperationError, PLUGIN_VERSION, SUPPORTED_OPS } from '../../apps/figma-plugin/src/executor.js';
import { FakeFigma } from './fake-figma.js';

export class FakePluginTransport implements FigmaTransport {
  readonly figma: FakeFigma;
  private executor;
  connected = true;
  log: Array<{ op: string; ok: boolean }> = [];
  /** Throws a timeout AFTER executing the next matching op (simulates "applied in Figma, response lost"). */
  loseResponseFor: string | null = null;
  /** Throws before executing the next matching op (simulates a plugin crash/disconnect). */
  failBefore: { op: string; error: FigmaBridgeError } | null = null;

  constructor(figma = new FakeFigma({ fileKey: 'FAKEFILEKEY1', fileName: 'Mock file' })) {
    this.figma = figma;
    this.executor = createExecutor(figma as unknown as PluginAPI);
  }

  async status(): Promise<BridgeStatus> {
    if (!this.connected) return { connected: false, role: 'in-memory', detail: 'mock plugin disconnected' };
    return { connected: true, role: 'in-memory', plugin: { version: PLUGIN_VERSION, fileKey: this.figma.fileKey ?? null, fileName: this.figma.root.name, editorType: 'figma', supportedOps: [...SUPPORTED_OPS], connectedAt: new Date().toISOString() } };
  }

  async request(operation: FigmaOperation): Promise<unknown> {
    if (!this.connected) throw new FigmaBridgeError('not_connected', 'mock plugin disconnected');
    const op = FigmaOperationSchema.parse(operation);
    if (this.failBefore && this.failBefore.op === op.op) {
      const e = this.failBefore.error;
      this.failBefore = null;
      this.log.push({ op: op.op, ok: false });
      throw e;
    }
    try {
      const result = await this.executor.execute(op as never);
      this.log.push({ op: op.op, ok: true });
      if (this.loseResponseFor === op.op) {
        this.loseResponseFor = null;
        throw new FigmaBridgeError('timeout', `no response for ${op.op} (simulated)`);
      }
      return result;
    } catch (err) {
      if (err instanceof FigmaBridgeError) throw err;
      this.log.push({ op: op.op, ok: false });
      const code = err instanceof OperationError ? err.code : 'plugin_error';
      throw new FigmaBridgeError(code as 'plugin_error', (err as Error).message);
    }
  }

  async close(): Promise<void> {}
}
