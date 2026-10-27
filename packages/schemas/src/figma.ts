import { z } from 'zod';

/* ---------- Paint / effects ---------- */

export const HexColorSchema = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected #RRGGBB or #RRGGBBAA');

export const PaintSpecSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SOLID'), color: HexColorSchema, opacity: z.number().min(0).max(1).optional(), variable: z.string().optional() }),
  z.object({
    type: z.literal('GRADIENT_LINEAR'),
    angle: z.number().default(180),
    stops: z.array(z.object({ position: z.number().min(0).max(1), color: HexColorSchema })).min(2),
  }),
  z.object({
    type: z.literal('IMAGE'),
    /** Hash returned by the `import_image` operation. */
    imageHash: z.string(),
    scaleMode: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).default('FILL'),
  }),
]);
export type PaintSpec = z.infer<typeof PaintSpecSchema>;

export const EffectSpecSchema = z.object({
  type: z.enum(['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR']),
  color: HexColorSchema.optional(),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  radius: z.number().min(0),
  spread: z.number().default(0),
});

export const AutoLayoutSpecSchema = z.object({
  mode: z.enum(['HORIZONTAL', 'VERTICAL', 'NONE']),
  padding: z.union([z.number(), z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() })]).optional(),
  itemSpacing: z.number().optional(),
  counterAxisSpacing: z.number().optional(),
  primaryAxisAlign: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']).optional(),
  counterAxisAlign: z.enum(['MIN', 'CENTER', 'MAX', 'BASELINE']).optional(),
  wrap: z.boolean().optional(),
});

export const SizingSchema = z.enum(['FIXED', 'HUG', 'FILL']);

export const TextSpecSchema = z.object({
  characters: z.string(),
  fontFamily: z.string(),
  fontStyle: z.string().default('Regular'),
  fontSize: z.number().positive(),
  lineHeight: z.union([z.number().positive(), z.literal('AUTO')]).optional(),
  letterSpacing: z.number().optional(),
  align: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']).optional(),
  autoResize: z.enum(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE']).optional(),
  textCase: z.enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE']).optional(),
  maxLines: z.number().int().positive().optional(),
});

export const NodeTypeSpecSchema = z.enum(['FRAME', 'TEXT', 'RECTANGLE', 'ELLIPSE', 'LINE', 'COMPONENT', 'INSTANCE', 'SVG']);

/**
 * Declarative, fully resolved node tree that the plugin upserts. `logicalId` is the stable identity used for
 * idempotent writes: the plugin stores it in pluginData and updates an existing node instead of duplicating it.
 */
const NodeSpecBaseSchema = z.object({
  logicalId: z.string().regex(/^[a-z0-9][a-z0-9:/._-]*$/i).max(200),
  type: NodeTypeSpecSchema,
  name: z.string().min(1),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  fills: z.array(PaintSpecSchema).optional(),
  strokes: z.array(PaintSpecSchema).optional(),
  strokeWeight: z.number().min(0).optional(),
  cornerRadius: z.union([z.number().min(0), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  effects: z.array(EffectSpecSchema).optional(),
  clipsContent: z.boolean().optional(),
  layout: AutoLayoutSpecSchema.optional(),
  layoutSizingHorizontal: SizingSchema.optional(),
  layoutSizingVertical: SizingSchema.optional(),
  layoutPositioning: z.enum(['AUTO', 'ABSOLUTE']).optional(),
  constraints: z.object({
    horizontal: z.enum(['MIN', 'CENTER', 'MAX', 'STRETCH', 'SCALE']),
    vertical: z.enum(['MIN', 'CENTER', 'MAX', 'STRETCH', 'SCALE']),
  }).optional(),
  text: TextSpecSchema.optional(),
  textStyle: z.string().optional(),
  svg: z.string().max(200_000).optional(),
  /** For INSTANCE: logicalId of a COMPONENT created by this system, or a component key from the file. */
  componentRef: z.string().optional(),
  /** Text overrides for instances keyed by child layer name. */
  overrides: z.record(z.string(), z.string()).optional(),
  /** Free-form annotations stored as pluginData (e.g. `placeholder: "true"`). */
  meta: z.record(z.string(), z.string()).optional(),
});
export type NodeSpec = z.output<typeof NodeSpecBaseSchema> & { children?: NodeSpec[] };
export type NodeSpecInput = z.input<typeof NodeSpecBaseSchema> & { children?: NodeSpecInput[] };
export const NodeSpecSchema: z.ZodType<NodeSpec, NodeSpecInput> = NodeSpecBaseSchema.extend({
  get children(): z.ZodOptional<z.ZodArray<z.ZodType<NodeSpec, NodeSpecInput>>> {
    return z.array(NodeSpecSchema).optional();
  },
});

/* ---------- Bridge operations ---------- */

export const ParentRefSchema = z.union([
  z.object({ pageName: z.string() }),
  z.object({ pageId: z.string() }),
  z.object({ nodeId: z.string() }),
]);

const VariableValueSchema = z.union([HexColorSchema, z.number(), z.string(), z.boolean()]);

export const FigmaOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('ping') }),
  z.object({ op: z.literal('get_capabilities') }),
  z.object({ op: z.literal('read_document'), includeFrames: z.boolean().default(true) }),
  z.object({ op: z.literal('read_node'), nodeId: z.string(), depth: z.number().int().min(0).max(12).default(4) }),
  z.object({ op: z.literal('read_selection'), depth: z.number().int().min(0).max(12).default(3) }),
  z.object({ op: z.literal('read_components') }),
  z.object({ op: z.literal('read_styles') }),
  z.object({ op: z.literal('read_variables') }),
  z.object({ op: z.literal('list_fonts'), families: z.array(z.string()).optional() }),
  z.object({ op: z.literal('find_by_logical_ids'), projectId: z.string(), logicalIds: z.array(z.string()).max(500) }),
  z.object({ op: z.literal('ensure_page'), projectId: z.string(), name: z.string().min(1) }),
  z.object({
    op: z.literal('upsert_tree'),
    projectId: z.string(),
    parent: ParentRefSchema,
    tree: NodeSpecSchema,
    /** When a node exists and its fingerprint differs from this value, the plugin refuses to overwrite it. */
    expectedFingerprints: z.record(z.string(), z.string()).optional(),
    /** Remove children with a magec logicalId that are no longer in the spec. Only nodes this project created. */
    pruneOwnedChildren: z.boolean().default(false),
  }),
  z.object({
    op: z.literal('update_nodes'),
    projectId: z.string(),
    updates: z.array(z.object({
      nodeId: z.string(),
      expectedFingerprint: z.string().optional(),
      patch: z.object({
        name: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        visible: z.boolean().optional(),
        opacity: z.number().min(0).max(1).optional(),
        fills: z.array(PaintSpecSchema).optional(),
        characters: z.string().optional(),
        cornerRadius: z.number().min(0).optional(),
        layout: AutoLayoutSpecSchema.optional(),
      }),
    })).min(1).max(200),
  }),
  z.object({
    op: z.literal('delete_nodes'),
    projectId: z.string(),
    nodeIds: z.array(z.string()).min(1).max(200),
    /** Must be the approval task id that authorized the deletion. */
    authorization: z.string().min(1),
    /** Only nodes whose pluginData marks them as created by this project may be deleted unless false. */
    ownedOnly: z.boolean().default(true),
  }),
  z.object({
    op: z.literal('upsert_variables'),
    projectId: z.string(),
    collection: z.string(),
    modes: z.array(z.string()).min(1).default(['Default']),
    variables: z.array(z.object({
      name: z.string(),
      type: z.enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']),
      values: z.record(z.string(), VariableValueSchema),
    })).max(1000),
  }),
  z.object({
    op: z.literal('upsert_text_styles'),
    projectId: z.string(),
    styles: z.array(z.object({
      name: z.string(),
      fontFamily: z.string(),
      fontStyle: z.string(),
      fontSize: z.number().positive(),
      lineHeight: z.union([z.number().positive(), z.literal('AUTO')]).optional(),
      letterSpacing: z.number().optional(),
    })).max(200),
  }),
  z.object({
    op: z.literal('upsert_paint_styles'),
    projectId: z.string(),
    styles: z.array(z.object({ name: z.string(), color: HexColorSchema })).max(500),
  }),
  z.object({
    op: z.literal('combine_as_variants'),
    projectId: z.string(),
    logicalId: z.string(),
    name: z.string(),
    componentNodeIds: z.array(z.string()).min(1),
  }),
  z.object({ op: z.literal('import_image'), base64: z.string().max(14_000_000), mimeType: z.enum(['image/png', 'image/jpeg', 'image/gif']) }),
  z.object({
    op: z.literal('export_node'),
    nodeId: z.string(),
    format: z.enum(['PNG', 'JPG', 'SVG']).default('PNG'),
    scale: z.number().min(0.1).max(4).default(1),
  }),
]);
export type FigmaOperation = z.infer<typeof FigmaOperationSchema>;
export type FigmaOperationInput = z.input<typeof FigmaOperationSchema>;
export type FigmaOpName = FigmaOperation['op'];

export const FIGMA_READ_OPS = ['ping', 'get_capabilities', 'read_document', 'read_node', 'read_selection', 'read_components',
  'read_styles', 'read_variables', 'list_fonts', 'find_by_logical_ids', 'export_node'] as const satisfies readonly FigmaOpName[];
export const FIGMA_WRITE_OPS = ['ensure_page', 'upsert_tree', 'update_nodes', 'upsert_variables', 'upsert_text_styles',
  'upsert_paint_styles', 'combine_as_variants', 'import_image'] as const satisfies readonly FigmaOpName[];
export const FIGMA_DESTRUCTIVE_OPS = ['delete_nodes'] as const satisfies readonly FigmaOpName[];

export function figmaOpClass(op: FigmaOpName): 'read' | 'write' | 'destructive' {
  if ((FIGMA_DESTRUCTIVE_OPS as readonly string[]).includes(op)) return 'destructive';
  if ((FIGMA_WRITE_OPS as readonly string[]).includes(op)) return 'write';
  return 'read';
}

/* ---------- Bridge wire protocol ---------- */

export const BRIDGE_PROTOCOL_VERSION = 1;

export const BridgeHelloSchema = z.object({
  type: z.literal('hello'),
  role: z.enum(['plugin', 'controller']),
  token: z.string().min(16),
  protocol: z.number().int(),
  plugin: z.object({
    version: z.string(),
    fileKey: z.string().nullable(),
    fileName: z.string(),
    editorType: z.string(),
    apiVersion: z.string().optional(),
    supportedOps: z.array(z.string()),
  }).optional(),
});
export type BridgeHello = z.infer<typeof BridgeHelloSchema>;

export const BridgeRequestSchema = z.object({
  type: z.literal('request'),
  id: z.string(),
  operation: z.unknown(),
  idempotencyKey: z.string().optional(),
});

export const BridgeResponseSchema = z.object({
  type: z.literal('response'),
  id: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string(), code: z.string().optional() }).optional(),
  durationMs: z.number().optional(),
});
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;

/* ---------- Node mapping & operation journal ---------- */

export const FigmaNodeMappingSchema = z.object({
  logicalId: z.string(),
  nodeId: z.string(),
  fileKey: z.string(),
  pageId: z.string().optional(),
  type: z.string(),
  name: z.string(),
  /** Hash of the spec that produced the node; equal hash + equal fingerprint means nothing to do. */
  specHash: z.string().optional(),
  /** Fingerprint of the node as last written/observed by this system. */
  fingerprint: z.string().optional(),
  status: z.enum(['active', 'missing', 'changed-externally', 'deleted']).default('active'),
  taskId: z.string().optional(),
  updatedAt: z.string(),
});
export type FigmaNodeMapping = z.infer<typeof FigmaNodeMappingSchema>;

export const FigmaOperationJournalEntrySchema = z.object({
  operationId: z.string(),
  idempotencyKey: z.string(),
  op: z.string(),
  taskId: z.string().optional(),
  agent: z.string(),
  scope: z.string(),
  status: z.enum(['pending', 'confirmed', 'failed', 'recovered', 'abandoned']),
  logicalIds: z.array(z.string()).default([]),
  error: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
});
export type FigmaOperationJournalEntry = z.infer<typeof FigmaOperationJournalEntrySchema>;

/** Serialized node shape returned by read operations (subset of Figma node properties). */
export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  fills?: Array<{ type: string; color?: string; opacity?: number; visible?: boolean; imageHash?: string | null }>;
  strokes?: Array<{ type: string; color?: string }>;
  cornerRadius?: number | 'mixed';
  opacity?: number;
  clipsContent?: boolean;
  layoutMode?: string;
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  characters?: string;
  fontName?: { family: string; style: string } | 'mixed';
  fontSize?: number | 'mixed';
  textAlignHorizontal?: string;
  textAutoResize?: string;
  hasMissingFont?: boolean;
  componentId?: string;
  logicalId?: string;
  projectId?: string;
  meta?: Record<string, string>;
  fingerprint?: string;
  childCount?: number;
  children?: SerializedNode[];
}
