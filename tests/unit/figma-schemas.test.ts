import { describe, expect, it } from 'vitest';
import { FigmaOperationSchema, figmaOpClass, FIGMA_DESTRUCTIVE_OPS } from '@ui-ux-magec/schemas';

const tree = { logicalId: 'screen/home', type: 'FRAME', name: 'Home', children: [{ logicalId: 'screen/home/title', type: 'TEXT', name: 'Title', text: { characters: 'Hi', fontFamily: 'Inter', fontSize: 32 } }] };

describe('Figma operation schemas', () => {
  it('accepts well-formed structured operations', () => {
    expect(FigmaOperationSchema.parse({ op: 'upsert_tree', projectId: 'prj_1', parent: { pageId: '1:2' }, tree }).op).toBe('upsert_tree');
    expect(FigmaOperationSchema.parse({ op: 'read_node', nodeId: '12:34' }).op).toBe('read_node');
  });

  it('rejects unknown operations — there is no code execution channel', () => {
    for (const op of ['eval', 'execute', 'run_script', 'write_file']) expect(FigmaOperationSchema.safeParse({ op, code: 'figma.root.remove()' }).success).toBe(false);
  });

  it('rejects malformed node specs and unsafe payloads', () => {
    expect(FigmaOperationSchema.safeParse({ op: 'upsert_tree', projectId: 'prj_1', parent: { pageId: '1:2' }, tree: { ...tree, type: 'SCRIPT' } }).success).toBe(false);
    expect(FigmaOperationSchema.safeParse({ op: 'upsert_tree', projectId: 'prj_1', parent: { pageId: '1:2' }, tree: { ...tree, fills: [{ type: 'SOLID', color: 'red' }] } }).success).toBe(false);
    expect(FigmaOperationSchema.safeParse({ op: 'import_image', base64: 'AAAA', mimeType: 'application/x-sh' }).success).toBe(false);
  });

  it('requires authorization for destructive operations', () => {
    expect(FIGMA_DESTRUCTIVE_OPS).toContain('delete_nodes');
    expect(FigmaOperationSchema.safeParse({ op: 'delete_nodes', projectId: 'prj_1', nodeIds: ['1:2'] }).success).toBe(false);
    expect(FigmaOperationSchema.safeParse({ op: 'delete_nodes', projectId: 'prj_1', nodeIds: ['1:2'], authorization: 'tsk_approval' }).success).toBe(true);
    expect(figmaOpClass('delete_nodes')).toBe('destructive');
    expect(figmaOpClass('upsert_tree')).toBe('write');
    expect(figmaOpClass('read_document')).toBe('read');
  });
});
