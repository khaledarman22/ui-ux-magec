/**
 * LIVE Figma end-to-end test. Runs only with MAGEC_LIVE_FIGMA=1 and the "ui-ux-magec bridge" plugin open in
 * Figma Desktop on a disposable test file. It creates a real, editable
 * auto-layout frame with a text layer through the full stack (coordinator → bridge → plugin → Figma), reads it
 * back, re-applies to prove idempotency, then deletes only the nodes it created.
 *
 * When it does not run, the live Figma integration is UNVERIFIED — mocked tests do not prove it.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { BridgeConnection, FigmaWriteCoordinator } from '@ui-ux-magec/figma-bridge';
import { Workspace } from '@ui-ux-magec/workspace';
import { sandbox } from '../helpers/env.js';

const LIVE = process.env.MAGEC_LIVE_FIGMA === '1';
const realHome = process.env.MAGEC_HOME;

if (!LIVE) {
  process.stderr.write('\n[UNVERIFIED] Live Figma test skipped (set MAGEC_LIVE_FIGMA=1 with the bridge plugin open). Native Figma writes are verified only against a mock.\n');
}

describe.skipIf(!LIVE)('LIVE Figma: create a real editable frame', () => {
  const env = sandbox();
  if (realHome) process.env.MAGEC_HOME = realHome; // use the real pairing config
  let conn: BridgeConnection | null = null;
  afterAll(async () => {
    await conn?.close();
    env.cleanup();
  });

  it('writes, reads back, re-applies idempotently and cleans up', async () => {
    conn = BridgeConnection.fromConfig();
    expect(conn, 'no bridge config: run `npm run build` first').not.toBeNull();
    const status = await conn!.waitForPlugin(90_000);
    expect(status.connected, 'open the ui-ux-magec bridge plugin in Figma Desktop').toBe(true);
    const ws = await Workspace.init(env.dir, { name: 'Live Figma test' });
    const figma = new FigmaWriteCoordinator(ws, conn!);
    const stamp = new Date().toISOString();
    const tree = {
      logicalId: 'screen/live-test', type: 'FRAME' as const, name: `ui-ux-magec live test ${stamp}`, width: 480, height: 200,
      layout: { mode: 'VERTICAL' as const, padding: 24, itemSpacing: 12 },
      fills: [{ type: 'SOLID' as const, color: '#FFFFFF' }],
      children: [{ logicalId: 'screen/live-test/title', type: 'TEXT' as const, name: 'Title', text: { characters: 'Created by ui-ux-magec', fontFamily: 'Inter', fontStyle: 'Regular', fontSize: 24 } }],
    };
    const first = await figma.applyTree({ tree, page: 'ui-ux-magec live test', agent: 'figma-designer', taskId: 'live' });
    expect(first.operationId).toBeTruthy();
    const read = (await conn!.request({ op: 'read_node', nodeId: first.rootNodeId, depth: 2 })) as any;
    expect(read.type).toBe('FRAME');
    expect(read.layoutMode).toBe('VERTICAL');
    expect(read.children[0].type).toBe('TEXT');
    expect(read.children[0].characters).toBe('Created by ui-ux-magec');
    const second = await figma.applyTree({ tree, page: 'ui-ux-magec live test', agent: 'figma-designer', taskId: 'live' });
    expect(second.skipped).toBe(true);
    expect(second.rootNodeId).toBe(first.rootNodeId);
    const removed = await figma.deleteNodes(['screen/live-test'], 'live-test-cleanup', 'figma-designer');
    expect(removed.deleted.length).toBe(1);
    process.stderr.write(`\n[VERIFIED] Live Figma write confirmed in "${status.plugin?.fileName}" (plugin v${status.plugin?.version}).\n`);
  }, 180_000);
});
