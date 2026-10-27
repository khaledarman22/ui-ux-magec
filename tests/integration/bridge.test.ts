// Real WebSocket bridge (server + controller) with a SIMULATED plugin client. Figma itself is mocked.
import { afterEach, describe, expect, it } from 'vitest';
import { BridgeConnection, FigmaBridgeError } from '@ui-ux-magec/figma-bridge';
import { connectSimulatedPlugin } from '../helpers/sim-plugin.js';

const token = 'a'.repeat(64);
const open: Array<{ close: () => unknown }> = [];
afterEach(async () => {
  for (const c of open.splice(0)) await c.close();
});
const port = () => 46000 + Math.floor(Math.random() * 2000);

describe('Figma bridge protocol', () => {
  it('authenticates the plugin, relays validated operations and returns results', async () => {
    const p = port();
    const host = new BridgeConnection({ port: p, token });
    open.push(host);
    await host.start();
    const plugin = await connectSimulatedPlugin(p, token);
    open.push(plugin);
    expect(plugin.welcome.ok).toBe(true);
    const status = await host.status();
    expect(status.connected).toBe(true);
    expect(status.plugin?.fileName).toBe('Simulated file');
    const caps = (await host.request({ op: 'get_capabilities' })) as { supportedOps: string[] };
    expect(caps.supportedOps).toContain('upsert_tree');
    const page = (await host.request({ op: 'ensure_page', projectId: 'prj_x', name: 'Home' })) as { pageId: string };
    await host.request({ op: 'upsert_tree', projectId: 'prj_x', parent: { pageId: page.pageId }, tree: { logicalId: 'screen/a', type: 'FRAME', name: 'A', width: 400, height: 300, layout: { mode: 'VERTICAL', itemSpacing: 8 } } });
    expect(plugin.figma.byLogicalId('screen/a')[0]!.layoutMode).toBe('VERTICAL');
  });

  it('rejects a plugin with the wrong pairing token', async () => {
    const p = port();
    const host = new BridgeConnection({ port: p, token });
    open.push(host);
    await host.start();
    const bad = await connectSimulatedPlugin(p, 'b'.repeat(64));
    open.push(bad);
    expect(bad.welcome.ok).toBe(false);
    expect((await host.status()).connected).toBe(false);
  });

  it('a second process joins as controller and shares the same plugin', async () => {
    const p = port();
    const host = new BridgeConnection({ port: p, token });
    open.push(host);
    await host.start();
    const plugin = await connectSimulatedPlugin(p, token);
    open.push(plugin);
    const controller = new BridgeConnection({ port: p, token });
    open.push(controller);
    const res = (await controller.request({ op: 'ping' })) as { pong: boolean };
    expect(res.pong).toBe(true);
    expect((await controller.status()).role).toBe('controller');
  });

  it('validates operations before they reach the plugin and propagates plugin error codes', async () => {
    const p = port();
    const host = new BridgeConnection({ port: p, token });
    open.push(host);
    await host.start();
    const plugin = await connectSimulatedPlugin(p, token);
    open.push(plugin);
    await expect(host.request({ op: 'eval', code: 'x' } as never)).rejects.toThrow();
    const err = (await host.request({ op: 'read_node', nodeId: '999:999' }).catch((e: unknown) => e)) as FigmaBridgeError;
    expect(err).toBeInstanceOf(FigmaBridgeError);
    expect(err.code).toBe('node_missing');
  });

  it('reports not connected when no plugin is open', async () => {
    const p = port();
    const host = new BridgeConnection({ port: p, token });
    open.push(host);
    await host.start();
    await expect(host.request({ op: 'ping' }, { timeoutMs: 500 })).rejects.toMatchObject({ code: 'not_connected' });
  });
});
