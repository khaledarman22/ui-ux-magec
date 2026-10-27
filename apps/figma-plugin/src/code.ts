import { PLUGIN_VERSION, SUPPORTED_OPS, createExecutor, type Operation } from './executor';

// Injected at build time from ~/.ui-ux-magec/config.json, so the plugin connects with no manual pairing.
declare const __BRIDGE_PORT__: number;
declare const __BRIDGE_TOKEN__: string;

const executor = createExecutor(figma);
figma.showUI(__html__, { width: 300, height: 150, themeColors: true });

type UiMessage =
  | { type: 'request'; id: string; operation: Operation }
  | { type: 'get-settings' }
  | { type: 'notify'; message: string; error?: boolean };

// Requests are executed strictly one at a time so concurrent writes can never interleave inside Figma.
let queue: Promise<void> = Promise.resolve();

figma.ui.onmessage = (msg: UiMessage) => {
  if (msg.type === 'get-settings') {
    figma.ui.postMessage({
      type: 'settings',
      token: __BRIDGE_TOKEN__,
      port: __BRIDGE_PORT__,
      plugin: { version: PLUGIN_VERSION, fileKey: figma.fileKey ?? null, fileName: figma.root.name, editorType: figma.editorType, apiVersion: figma.apiVersion, supportedOps: SUPPORTED_OPS },
    });
    return;
  }
  if (msg.type === 'notify') {
    figma.notify(msg.message, { error: msg.error ?? false, timeout: 2500 });
    return;
  }
  if (msg.type === 'request') {
    queue = queue.then(async () => {
      const started = Date.now();
      try {
        const result = await executor.execute(msg.operation);
        figma.ui.postMessage({ type: 'response', id: msg.id, ok: true, result, durationMs: Date.now() - started });
      } catch (err) {
        const e = err as Error & { code?: string };
        figma.ui.postMessage({ type: 'response', id: msg.id, ok: false, error: { message: e.message || String(err), code: e.code ?? 'plugin_error' }, durationMs: Date.now() - started });
      }
    });
  }
};
