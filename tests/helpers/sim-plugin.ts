/**
 * MOCK plugin client: speaks the real bridge WebSocket protocol (hello/request/response) like apps/figma-plugin's
 * UI, and executes requests with the real plugin executor against FakeFigma. Used to test the bridge without Figma.
 */
import WebSocket from 'ws';
import { BRIDGE_PROTOCOL_VERSION } from '@ui-ux-magec/schemas';
import { createExecutor, OperationError, PLUGIN_VERSION, SUPPORTED_OPS } from '../../apps/figma-plugin/src/executor.js';
import { FakeFigma } from './fake-figma.js';

export async function connectSimulatedPlugin(port: number, token: string, figma = new FakeFigma({ fileKey: 'SIMFILE', fileName: 'Simulated file' })) {
  const exec = createExecutor(figma as unknown as PluginAPI);
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: 'null' } });
  const welcome = await new Promise<Record<string, unknown>>((resolve, reject) => {
    ws.once('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', role: 'plugin', token, protocol: BRIDGE_PROTOCOL_VERSION, plugin: { version: PLUGIN_VERSION, fileKey: figma.fileKey ?? null, fileName: figma.root.name, editorType: 'figma', supportedOps: [...SUPPORTED_OPS] } })));
    ws.once('message', (raw) => resolve(JSON.parse(raw.toString())));
  });
  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type !== 'request') return;
    try {
      const result = await exec.execute(msg.operation);
      ws.send(JSON.stringify({ type: 'response', id: msg.id, ok: true, result }));
    } catch (err) {
      ws.send(JSON.stringify({ type: 'response', id: msg.id, ok: false, error: { message: (err as Error).message, code: err instanceof OperationError ? err.code : 'plugin_error' } }));
    }
  });
  return { ws, figma, welcome, close: () => ws.close() };
}
