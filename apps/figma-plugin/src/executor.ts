/**
 * Executes ui-ux-magec bridge operations inside Figma using the Plugin API. The runtime validates every
 * operation with zod before sending it; this file re-checks the essentials (defense in depth) and only
 * implements a fixed whitelist of structured operations — there is no eval or code channel.
 *
 * The Figma API object is injected so the same code runs in Figma and against a fake document in tests.
 */

export const PLUGIN_VERSION = '0.1.0';

export const SUPPORTED_OPS = [
  'ping', 'get_capabilities', 'read_document', 'read_node', 'read_selection', 'read_components', 'read_styles',
  'read_variables', 'list_fonts', 'find_by_logical_ids', 'ensure_page', 'upsert_tree', 'update_nodes', 'delete_nodes',
  'upsert_variables', 'upsert_text_styles', 'upsert_paint_styles', 'combine_as_variants', 'import_image', 'export_node',
] as const;

const KEY_LID = 'magec.logicalId';
const KEY_PID = 'magec.projectId';
const KEY_META = 'magec.meta';

/* ---------- Spec types (mirror of @ui-ux-magec/schemas, kept local so the bundle has no dependencies) ---------- */

type PaintSpec =
  | { type: 'SOLID'; color: string; opacity?: number; variable?: string }
  | { type: 'GRADIENT_LINEAR'; angle?: number; stops: Array<{ position: number; color: string }> }
  | { type: 'IMAGE'; imageHash: string; scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE' };

interface EffectSpec { type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'; color?: string; offsetX?: number; offsetY?: number; radius: number; spread?: number }

interface NodeSpec {
  logicalId: string;
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'ELLIPSE' | 'LINE' | 'COMPONENT' | 'INSTANCE' | 'SVG';
  name: string;
  x?: number; y?: number; width?: number; height?: number;
  fills?: PaintSpec[]; strokes?: PaintSpec[]; strokeWeight?: number;
  cornerRadius?: number | [number, number, number, number];
  opacity?: number; effects?: EffectSpec[]; clipsContent?: boolean;
  layout?: {
    mode: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
    padding?: number | { top: number; right: number; bottom: number; left: number };
    itemSpacing?: number; counterAxisSpacing?: number;
    primaryAxisAlign?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    counterAxisAlign?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
    wrap?: boolean;
  };
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
  constraints?: { horizontal: ConstraintType; vertical: ConstraintType };
  text?: {
    characters: string; fontFamily: string; fontStyle?: string; fontSize: number; lineHeight?: number | 'AUTO';
    letterSpacing?: number; align?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    autoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE'; textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE'; maxLines?: number;
  };
  textStyle?: string;
  svg?: string;
  componentRef?: string;
  overrides?: Record<string, string>;
  meta?: Record<string, string>;
  children?: NodeSpec[];
}

export interface Operation { op: string; [k: string]: unknown }

export class OperationError extends Error {
  constructor(message: string, public readonly code = 'plugin_error') {
    super(message);
  }
}

/* ---------- Helpers ---------- */

function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) throw new OperationError(`invalid color ${hex}`, 'invalid_operation');
  const n = parseInt(m[1]!, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
}

function rgbToHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

/** djb2 over a canonical string — stable across runs, cheap enough for whole pages. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

function paintSummary(paints: unknown): unknown {
  if (!Array.isArray(paints)) return 'mixed';
  return paints.map((p: Paint) => (p.type === 'SOLID' ? [p.type, rgbToHex(p.color), round(p.opacity ?? 1), p.visible !== false] : p.type === 'IMAGE' ? [p.type, p.imageHash] : [p.type]));
}

/**
 * Fingerprint of the properties a designer would edit. Position is excluded (moving a frame on the canvas is
 * not a content edit); child count is included so added or removed layers are detected.
 */
export function fingerprint(node: SceneNode): string {
  const n: LooseNode = node;
  const parts: unknown[] = [n.type, n.name, round(n.width), round(n.height), 'fills' in n ? paintSummary(n.fills) : null];
  if (n.type === 'TEXT') parts.push(n.characters, typeof n.fontSize === 'number' ? n.fontSize : 'mixed', typeof n.fontName === 'object' && n.fontName && 'family' in n.fontName ? `${n.fontName.family}/${n.fontName.style}` : 'mixed', n.textAlignHorizontal);
  if ('layoutMode' in n) parts.push(n.layoutMode, n.itemSpacing, n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft, n.primaryAxisAlignItems, n.counterAxisAlignItems);
  if ('cornerRadius' in n) parts.push(typeof n.cornerRadius === 'number' ? n.cornerRadius : 'mixed');
  if ('children' in n && Array.isArray(n.children)) parts.push(n.children.length);
  return hashString(JSON.stringify(parts));
}

function isOwned(node: BaseNode, projectId: string): boolean {
  return node.getPluginData(KEY_PID) === projectId && node.getPluginData(KEY_LID) !== '';
}

function req<T>(op: Operation, key: string, type: 'string' | 'object' | 'array' | 'number'): T {
  const v = op[key];
  const ok = type === 'array' ? Array.isArray(v) : type === 'object' ? v !== null && typeof v === 'object' : typeof v === type;
  if (!ok) throw new OperationError(`"${op.op}" requires ${type} "${key}"`, 'invalid_operation');
  return v as T;
}

/** Property bag view of a node for code that reads type-specific fields after its own checks. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseNode = any;

type ContainerNode = PageNode | FrameNode | ComponentNode | ComponentSetNode | GroupNode | InstanceNode;

/* ---------- Executor ---------- */

export function createExecutor(api: PluginAPI) {
  const loadedFonts = new Set<string>();
  const missingFonts = new Set<string>();

  async function loadFont(family: string, style: string): Promise<FontName> {
    const key = `${family}::${style}`;
    if (loadedFonts.has(key)) return { family, style };
    try {
      await api.loadFontAsync({ family, style });
      loadedFonts.add(key);
      return { family, style };
    } catch {
      missingFonts.add(key);
      const fallback = { family: 'Inter', style: 'Regular' };
      await api.loadFontAsync(fallback);
      loadedFonts.add('Inter::Regular');
      return fallback;
    }
  }

  async function getNode(id: string): Promise<BaseNode> {
    const node = await api.getNodeByIdAsync(id);
    if (!node) throw new OperationError(`node ${id} not found`, 'node_missing');
    return node;
  }

  function serialize(node: BaseNode, depth: number): Record<string, unknown> {
    const n: LooseNode = node;
    const out: Record<string, unknown> = { id: n.id, name: n.name, type: n.type };
    if ('visible' in n) out.visible = n.visible;
    if (typeof n.x === 'number') Object.assign(out, { x: round(n.x), y: round(n.y), width: round(n.width), height: round(n.height) });
    if ('absoluteBoundingBox' in n) out.absoluteBoundingBox = n.absoluteBoundingBox;
    if ('fills' in n && Array.isArray(n.fills)) {
      out.fills = (n.fills as Paint[]).map((p) => ({ type: p.type, visible: p.visible !== false, ...(p.type === 'SOLID' ? { color: rgbToHex(p.color), opacity: p.opacity ?? 1 } : {}), ...(p.type === 'IMAGE' ? { imageHash: p.imageHash } : {}) }));
    }
    if ('strokes' in n && Array.isArray(n.strokes)) out.strokes = (n.strokes as Paint[]).map((p) => ({ type: p.type, ...(p.type === 'SOLID' ? { color: rgbToHex(p.color) } : {}) }));
    if ('cornerRadius' in n) out.cornerRadius = typeof n.cornerRadius === 'number' ? n.cornerRadius : 'mixed';
    if ('opacity' in n) out.opacity = n.opacity;
    if ('clipsContent' in n) out.clipsContent = n.clipsContent;
    if ('layoutMode' in n && n.layoutMode) {
      Object.assign(out, { layoutMode: n.layoutMode, itemSpacing: n.itemSpacing, padding: { top: n.paddingTop, right: n.paddingRight, bottom: n.paddingBottom, left: n.paddingLeft } });
    }
    if ('layoutSizingHorizontal' in n) Object.assign(out, { layoutSizingHorizontal: n.layoutSizingHorizontal, layoutSizingVertical: n.layoutSizingVertical });
    if (n.type === 'TEXT') {
      Object.assign(out, {
        characters: n.characters, fontSize: typeof n.fontSize === 'number' ? n.fontSize : 'mixed',
        fontName: typeof n.fontName === 'object' && n.fontName && 'family' in n.fontName ? n.fontName : 'mixed',
        textAlignHorizontal: n.textAlignHorizontal, textAutoResize: n.textAutoResize, hasMissingFont: n.hasMissingFont,
      });
    }
    if (n.type === 'INSTANCE') out.componentId = (n as InstanceNode).mainComponent?.id;
    const lid = node.getPluginData(KEY_LID);
    if (lid) {
      out.logicalId = lid;
      out.projectId = node.getPluginData(KEY_PID);
      const meta = node.getPluginData(KEY_META);
      if (meta) out.meta = JSON.parse(meta);
    }
    if ('type' in node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') out.fingerprint = fingerprint(node as SceneNode);
    if ('children' in node) {
      const kids = (node as ChildrenMixin).children;
      out.childCount = kids.length;
      if (depth > 0) out.children = kids.slice(0, 400).map((c) => serialize(c, depth - 1));
    }
    return out;
  }

  async function ownedIndex(scope: PageNode | DocumentNode, projectId: string): Promise<Map<string, SceneNode>> {
    const map = new Map<string, SceneNode>();
    const pages = scope.type === 'DOCUMENT' ? scope.children : [scope];
    for (const page of pages) {
      await page.loadAsync();
      for (const n of page.findAll((x) => x.getPluginData(KEY_PID) === projectId)) {
        const lid = n.getPluginData(KEY_LID);
        if (lid && !map.has(lid)) map.set(lid, n);
      }
    }
    return map;
  }

  function pageOf(node: BaseNode): PageNode | null {
    let p: BaseNode | null = node;
    while (p && p.type !== 'PAGE') p = p.parent;
    return p as PageNode | null;
  }

  const variableCache = new Map<string, Variable>();
  async function variableByName(name: string): Promise<Variable | null> {
    if (!variableCache.size) {
      for (const v of await api.variables.getLocalVariablesAsync()) variableCache.set(v.name, v);
    }
    return variableCache.get(name) ?? null;
  }

  async function toPaints(specs: PaintSpec[]): Promise<Paint[]> {
    const out: Paint[] = [];
    for (const s of specs) {
      if (s.type === 'SOLID') {
        const c = hexToRgb(s.color);
        let paint: SolidPaint = { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: s.opacity ?? c.a };
        if (s.variable) {
          const v = await variableByName(s.variable);
          if (v) paint = api.variables.setBoundVariableForPaint(paint, 'color', v);
        }
        out.push(paint);
      } else if (s.type === 'GRADIENT_LINEAR') {
        const rad = (((s.angle ?? 180) - 90) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        out.push({
          type: 'GRADIENT_LINEAR',
          gradientTransform: [[cos, sin, 0.5 - 0.5 * cos - 0.5 * sin], [-sin, cos, 0.5 + 0.5 * sin - 0.5 * cos]],
          gradientStops: s.stops.map((st) => {
            const c = hexToRgb(st.color);
            return { position: st.position, color: { r: c.r, g: c.g, b: c.b, a: c.a } };
          }),
        });
      } else {
        out.push({ type: 'IMAGE', imageHash: s.imageHash, scaleMode: s.scaleMode ?? 'FILL' });
      }
    }
    return out;
  }

  function toEffects(specs: EffectSpec[]): Effect[] {
    return specs.map((e): Effect => {
      if (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR') return { type: e.type, radius: e.radius, visible: true } as Effect;
      const c = hexToRgb(e.color ?? '#00000040');
      return { type: e.type, color: { r: c.r, g: c.g, b: c.b, a: c.a }, offset: { x: e.offsetX ?? 0, y: e.offsetY ?? 0 }, radius: e.radius, spread: e.spread ?? 0, visible: true, blendMode: 'NORMAL' } as Effect;
    });
  }

  function compatible(node: SceneNode, spec: NodeSpec): boolean {
    if (spec.type === 'SVG') return node.type === 'FRAME';
    return node.type === spec.type;
  }

  async function createFor(spec: NodeSpec, index: Map<string, SceneNode>): Promise<SceneNode> {
    switch (spec.type) {
      case 'FRAME': {
        const f = api.createFrame();
        f.fills = [];
        f.clipsContent = false;
        return f;
      }
      case 'COMPONENT': {
        const c = api.createComponent();
        c.fills = [];
        return c;
      }
      case 'TEXT': return api.createText();
      case 'RECTANGLE': return api.createRectangle();
      case 'ELLIPSE': return api.createEllipse();
      case 'LINE': return api.createLine();
      case 'SVG': {
        if (!spec.svg) throw new OperationError(`${spec.logicalId}: SVG node without markup`, 'invalid_operation');
        return api.createNodeFromSvg(spec.svg);
      }
      case 'INSTANCE': {
        const ref = spec.componentRef ?? '';
        let comp: BaseNode | null = index.get(ref) ?? null;
        if (!comp && /^\d+:\d+$/.test(ref)) comp = await api.getNodeByIdAsync(ref);
        if (!comp) {
          // Component sets are stored under componentset/<id>; pick the default (first) variant.
          const set = index.get(ref.replace(/^component\//, 'componentset/'));
          if (set && set.type === 'COMPONENT_SET') comp = (set.defaultVariant ?? set.children[0]) as ComponentNode;
        }
        if (!comp || comp.type !== 'COMPONENT') throw new OperationError(`${spec.logicalId}: component "${ref}" not found`, 'node_missing');
        return comp.createInstance();
      }
    }
  }

  interface BuildState {
    projectId: string;
    index: Map<string, SceneNode>;
    results: Array<{ logicalId: string; nodeId: string; action: 'created' | 'updated'; type: string; name: string; node: SceneNode }>;
    warnings: string[];
    textStyles: Map<string, TextStyle>;
    prune: boolean;
  }

  async function applyProps(node: SceneNode, spec: NodeSpec, st: BuildState, isNewRoot: boolean, isRoot: boolean): Promise<void> {
    const n: LooseNode = node;
    n.name = spec.name;
    if (spec.layoutPositioning && 'layoutPositioning' in n) {
      try {
        n.layoutPositioning = spec.layoutPositioning;
      } catch {
        st.warnings.push(`${spec.logicalId}: absolute positioning needs an auto-layout parent`);
      }
    }
    // Existing top-level frames keep their canvas position: the user may have arranged them.
    const keepPosition = isRoot && !isNewRoot;
    if (!keepPosition && spec.x !== undefined) n.x = spec.x;
    if (!keepPosition && spec.y !== undefined) n.y = spec.y;
    if (spec.type === 'TEXT' && spec.text) {
      const t = node as TextNode;
      const font = await loadFont(spec.text.fontFamily, spec.text.fontStyle ?? 'Regular');
      if (font.family !== spec.text.fontFamily) st.warnings.push(`${spec.logicalId}: font "${spec.text.fontFamily} ${spec.text.fontStyle ?? 'Regular'}" unavailable, used Inter Regular`);
      t.fontName = font;
      t.characters = spec.text.characters;
      t.fontSize = spec.text.fontSize;
      if (spec.text.lineHeight !== undefined) t.lineHeight = spec.text.lineHeight === 'AUTO' ? { unit: 'AUTO' } : { unit: 'PIXELS', value: spec.text.lineHeight };
      if (spec.text.letterSpacing !== undefined) t.letterSpacing = { unit: 'PIXELS', value: spec.text.letterSpacing };
      if (spec.text.align) t.textAlignHorizontal = spec.text.align;
      if (spec.text.textCase) t.textCase = spec.text.textCase;
      if (spec.text.maxLines) {
        t.textTruncation = 'ENDING';
        t.maxLines = spec.text.maxLines;
      }
      const resize = spec.text.autoResize === 'TRUNCATE' ? 'HEIGHT' : spec.text.autoResize;
      if (resize) t.textAutoResize = resize;
      const style = spec.textStyle ? st.textStyles.get(spec.textStyle) : undefined;
      if (style && font.family === spec.text.fontFamily) await t.setTextStyleIdAsync(style.id);
    }
    if (spec.type === 'INSTANCE' && spec.overrides) {
      const inst = node as InstanceNode;
      for (const [layer, value] of Object.entries(spec.overrides)) {
        const target = inst.findOne((c) => c.type === 'TEXT' && c.name === layer) as TextNode | null;
        if (!target) {
          st.warnings.push(`${spec.logicalId}: override layer "${layer}" not found in instance`);
          continue;
        }
        const fn = target.fontName;
        if (typeof fn === 'object' && 'family' in fn) await loadFont(fn.family, fn.style);
        target.characters = value;
      }
    }
    if (spec.layout && 'layoutMode' in n) {
      const L = spec.layout;
      n.layoutMode = L.mode;
      if (L.mode !== 'NONE') {
        if (L.padding !== undefined) {
          const p = typeof L.padding === 'number' ? { top: L.padding, right: L.padding, bottom: L.padding, left: L.padding } : L.padding;
          n.paddingTop = p.top;
          n.paddingRight = p.right;
          n.paddingBottom = p.bottom;
          n.paddingLeft = p.left;
        }
        if (L.itemSpacing !== undefined) n.itemSpacing = L.itemSpacing;
        if (L.primaryAxisAlign) n.primaryAxisAlignItems = L.primaryAxisAlign;
        if (L.counterAxisAlign) n.counterAxisAlignItems = L.counterAxisAlign;
        if (L.wrap && L.mode === 'HORIZONTAL') {
          n.layoutWrap = 'WRAP';
          if (L.counterAxisSpacing !== undefined) n.counterAxisSpacing = L.counterAxisSpacing;
        }
      }
    }
    if (spec.width !== undefined || spec.height !== undefined) {
      if ('resize' in n) n.resize(spec.width ?? Math.max(n.width, 0.01), spec.height ?? Math.max(n.height, 0.01));
    }
    for (const [axis, value] of [['layoutSizingHorizontal', spec.layoutSizingHorizontal], ['layoutSizingVertical', spec.layoutSizingVertical]] as const) {
      if (!value || !(axis in n)) continue;
      try {
        (n as FrameNode)[axis] = value;
      } catch {
        st.warnings.push(`${spec.logicalId}: cannot set ${axis}=${value} (requires an auto-layout parent or auto-layout frame)`);
      }
    }
    if (spec.fills && 'fills' in n) n.fills = await toPaints(spec.fills);
    if (spec.strokes && 'strokes' in n) n.strokes = await toPaints(spec.strokes);
    if (spec.strokeWeight !== undefined && 'strokeWeight' in n) n.strokeWeight = spec.strokeWeight;
    if (spec.cornerRadius !== undefined && 'cornerRadius' in n) {
      if (Array.isArray(spec.cornerRadius)) {
        [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius] = spec.cornerRadius;
      } else {
        n.cornerRadius = spec.cornerRadius;
      }
    }
    if (spec.opacity !== undefined) n.opacity = spec.opacity;
    if (spec.effects && 'effects' in n) n.effects = toEffects(spec.effects);
    if (spec.clipsContent !== undefined && 'clipsContent' in n) n.clipsContent = spec.clipsContent;
    if (spec.constraints && 'constraints' in n) n.constraints = spec.constraints;
    node.setPluginData(KEY_PID, st.projectId);
    node.setPluginData(KEY_LID, spec.logicalId);
    node.setPluginData(KEY_META, spec.meta ? JSON.stringify(spec.meta) : '');
  }

  async function build(spec: NodeSpec, parent: ContainerNode, position: number, st: BuildState, isRoot: boolean): Promise<SceneNode> {
    let node = st.index.get(spec.logicalId) ?? null;
    let action: 'created' | 'updated' = 'updated';
    if (node && (node.removed || !compatible(node, spec))) {
      if (!node.removed) node.remove();
      node = null;
    }
    if (!node) {
      node = await createFor(spec, st.index);
      action = 'created';
      st.index.set(spec.logicalId, node);
    }
    // An existing top-level node stays where it is (e.g. a component inside its variant set, or a frame the
    // user moved into a section); only new roots and children are (re)ordered.
    const keepPlacement = isRoot && action === 'updated';
    if (!keepPlacement && (node.parent !== parent || (parent as ChildrenMixin).children.indexOf(node) !== position)) {
      const kids = (parent as ChildrenMixin).children;
      (parent as ChildrenMixin).insertChild(Math.min(position, kids.length - (node.parent === parent ? 1 : 0)), node);
    }
    await applyProps(node, spec, st, action === 'created', isRoot);
    st.results.push({ logicalId: spec.logicalId, nodeId: node.id, action, type: node.type, name: node.name, node });
    if (spec.children && 'children' in node && spec.type !== 'INSTANCE' && spec.type !== 'SVG') {
      const container = node as FrameNode;
      for (let i = 0; i < spec.children.length; i++) await build(spec.children[i]!, container, i, st, false);
      if (st.prune) {
        const keep = new Set(spec.children.map((c) => c.logicalId));
        for (const child of [...container.children]) {
          const lid = child.getPluginData(KEY_LID);
          if (lid && isOwned(child, st.projectId) && !keep.has(lid)) child.remove();
        }
      }
    }
    return node;
  }

  function specIds(spec: NodeSpec, out: string[] = []): string[] {
    out.push(spec.logicalId);
    for (const c of spec.children ?? []) specIds(c, out);
    return out;
  }

  function fontsOf(spec: NodeSpec, out: Set<string> = new Set()): Set<string> {
    if (spec.text) out.add(`${spec.text.fontFamily}::${spec.text.fontStyle ?? 'Regular'}`);
    for (const c of spec.children ?? []) fontsOf(c, out);
    return out;
  }

  async function resolveParent(parent: Record<string, string>): Promise<{ container: ContainerNode; page: PageNode }> {
    if (parent.pageId) {
      const page = await getNode(parent.pageId);
      if (page.type !== 'PAGE') throw new OperationError(`${parent.pageId} is not a page`, 'invalid_operation');
      await page.loadAsync();
      return { container: page, page };
    }
    if (parent.pageName) {
      const page = api.root.children.find((p) => p.name === parent.pageName);
      if (!page) throw new OperationError(`page "${parent.pageName}" not found`, 'node_missing');
      await page.loadAsync();
      return { container: page, page };
    }
    const node = await getNode(parent.nodeId ?? '');
    if (!('children' in node)) throw new OperationError(`${parent.nodeId} cannot contain children`, 'invalid_operation');
    const page = pageOf(node);
    if (!page) throw new OperationError(`${parent.nodeId} is not on a page`, 'invalid_operation');
    return { container: node as ContainerNode, page };
  }

  async function execute(op: Operation): Promise<unknown> {
    if (!op || typeof op.op !== 'string' || !(SUPPORTED_OPS as readonly string[]).includes(op.op)) {
      throw new OperationError(`unsupported operation ${String(op?.op)}`, 'unsupported_operation');
    }
    switch (op.op) {
      case 'ping':
        return { pong: true, version: PLUGIN_VERSION };

      case 'get_capabilities':
        return {
          version: PLUGIN_VERSION, supportedOps: SUPPORTED_OPS, editorType: api.editorType, apiVersion: api.apiVersion,
          fileKey: api.fileKey ?? null, fileName: api.root.name,
          features: { variables: typeof api.variables?.createVariable === 'function', componentSets: typeof api.combineAsVariants === 'function', export: true },
        };

      case 'read_document': {
        const pages = [];
        for (const page of api.root.children) {
          await page.loadAsync();
          pages.push({
            id: page.id, name: page.name, childCount: page.children.length,
            ...(op.includeFrames !== false ? { frames: page.children.slice(0, 500).map((c) => ({ id: c.id, name: c.name, type: c.type, width: round(c.width), height: round(c.height), logicalId: c.getPluginData(KEY_LID) || undefined })) } : {}),
          });
        }
        return { fileKey: api.fileKey ?? null, fileName: api.root.name, currentPageId: api.currentPage.id, pages };
      }

      case 'read_node': {
        const node = await getNode(req<string>(op, 'nodeId', 'string'));
        return serialize(node, typeof op.depth === 'number' ? op.depth : 4);
      }

      case 'read_selection':
        return { pageId: api.currentPage.id, nodes: api.currentPage.selection.map((n) => serialize(n, typeof op.depth === 'number' ? op.depth : 3)) };

      case 'read_components': {
        await api.loadAllPagesAsync();
        const nodes = api.root.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
        return {
          components: nodes.filter((n) => !(n.type === 'COMPONENT' && n.parent?.type === 'COMPONENT_SET')).map((n) => ({
            id: n.id, name: n.name, type: n.type, key: n.key, page: pageOf(n)?.name,
            description: n.description, logicalId: n.getPluginData(KEY_LID) || undefined,
            variants: n.type === 'COMPONENT_SET' ? n.children.map((c) => ({ id: c.id, name: c.name })) : [],
            width: round(n.width), height: round(n.height),
          })),
        };
      }

      case 'read_styles': {
        const [paint, text, effect] = await Promise.all([api.getLocalPaintStylesAsync(), api.getLocalTextStylesAsync(), api.getLocalEffectStylesAsync()]);
        return {
          paint: paint.map((s) => ({ id: s.id, name: s.name, paints: s.paints.map((p) => (p.type === 'SOLID' ? { type: p.type, color: rgbToHex(p.color) } : { type: p.type })) })),
          text: text.map((s) => ({ id: s.id, name: s.name, fontName: s.fontName, fontSize: s.fontSize, lineHeight: s.lineHeight })),
          effect: effect.map((s) => ({ id: s.id, name: s.name, effects: s.effects.map((e) => e.type) })),
        };
      }

      case 'read_variables': {
        const collections = await api.variables.getLocalVariableCollectionsAsync();
        const vars = await api.variables.getLocalVariablesAsync();
        return {
          collections: collections.map((c) => ({ id: c.id, name: c.name, modes: c.modes })),
          variables: vars.map((v) => ({
            id: v.id, name: v.name, type: v.resolvedType, collectionId: v.variableCollectionId,
            values: Object.fromEntries(Object.entries(v.valuesByMode).map(([m, val]) => [m, typeof val === 'object' && val && 'r' in val ? rgbToHex(val as RGB) : val])),
          })),
        };
      }

      case 'list_fonts': {
        const fonts = await api.listAvailableFontsAsync();
        const families = Array.isArray(op.families) ? new Set((op.families as string[]).map((f) => f.toLowerCase())) : null;
        const byFamily = new Map<string, string[]>();
        for (const f of fonts) {
          if (families && !families.has(f.fontName.family.toLowerCase())) continue;
          const list = byFamily.get(f.fontName.family) ?? [];
          list.push(f.fontName.style);
          byFamily.set(f.fontName.family, list);
        }
        return { families: [...byFamily.entries()].slice(0, 2000).map(([family, styles]) => ({ family, styles })) };
      }

      case 'find_by_logical_ids': {
        const projectId = req<string>(op, 'projectId', 'string');
        const wanted = new Set(req<string[]>(op, 'logicalIds', 'array'));
        const index = await ownedIndex(api.root, projectId);
        const found = [];
        for (const lid of wanted) {
          const n = index.get(lid);
          if (n) found.push({ logicalId: lid, nodeId: n.id, type: n.type, name: n.name, fingerprint: fingerprint(n), pageId: pageOf(n)?.id });
        }
        return { found };
      }

      case 'ensure_page': {
        const projectId = req<string>(op, 'projectId', 'string');
        const name = req<string>(op, 'name', 'string');
        const lid = `page/${name}`;
        const owned = api.root.children.find((p) => p.getPluginData(KEY_PID) === projectId && p.getPluginData(KEY_LID) === lid);
        if (owned) return { pageId: owned.id, created: false };
        // Reuse a same-named page rather than duplicating it; it is only tagged if no other project owns it.
        const named = api.root.children.find((p) => p.name === name);
        if (named) {
          if (!named.getPluginData(KEY_PID)) {
            named.setPluginData(KEY_PID, projectId);
            named.setPluginData(KEY_LID, lid);
          }
          return { pageId: named.id, created: false };
        }
        const page = api.createPage();
        page.name = name;
        page.setPluginData(KEY_PID, projectId);
        page.setPluginData(KEY_LID, lid);
        return { pageId: page.id, created: true };
      }

      case 'upsert_tree': {
        const projectId = req<string>(op, 'projectId', 'string');
        const tree = req<NodeSpec>(op, 'tree', 'object');
        const { container, page } = await resolveParent(req<Record<string, string>>(op, 'parent', 'object'));
        const index = await ownedIndex(api.root, projectId);
        const expected = (op.expectedFingerprints ?? {}) as Record<string, string>;
        // Check every expected fingerprint before mutating anything, so a conflict never leaves a half-written tree.
        const conflicts = [];
        for (const lid of specIds(tree)) {
          const n = index.get(lid);
          const exp = expected[lid];
          if (n && exp && fingerprint(n) !== exp) conflicts.push({ logicalId: lid, nodeId: n.id, expected: exp, actual: fingerprint(n) });
        }
        if (conflicts.length) return { rootNodeId: index.get(tree.logicalId)?.id ?? '', nodes: [], conflicts, warnings: [], missingFonts: [] };
        missingFonts.clear();
        for (const f of fontsOf(tree)) {
          const [family, style] = f.split('::') as [string, string];
          await loadFont(family, style);
        }
        const textStyles = new Map((await api.getLocalTextStylesAsync()).map((s) => [s.name, s]));
        const st: BuildState = { projectId, index, results: [], warnings: [], textStyles, prune: op.pruneOwnedChildren === true };
        const existingRoot = index.get(tree.logicalId);
        const position = existingRoot && existingRoot.parent === container ? (container as ChildrenMixin).children.indexOf(existingRoot) : (container as ChildrenMixin).children.length;
        const root = await build(tree, container, position, st, true);
        if (pageOf(root) !== page) st.warnings.push('root node ended up on a different page than requested');
        return {
          rootNodeId: root.id,
          nodes: st.results.map((r) => ({ logicalId: r.logicalId, nodeId: r.nodeId, action: r.action, type: r.type, name: r.name, fingerprint: fingerprint(r.node) })),
          warnings: st.warnings,
          missingFonts: [...missingFonts],
        };
      }

      case 'update_nodes': {
        const projectId = req<string>(op, 'projectId', 'string');
        const updates = req<Array<{ nodeId: string; expectedFingerprint?: string; patch: Record<string, unknown> }>>(op, 'updates', 'array');
        const nodes: SceneNode[] = [];
        for (const u of updates) nodes.push(await getNode(u.nodeId) as SceneNode);
        const conflicts = updates.flatMap((u, i) => (u.expectedFingerprint && fingerprint(nodes[i]!) !== u.expectedFingerprint ? [{ nodeId: u.nodeId, expected: u.expectedFingerprint, actual: fingerprint(nodes[i]!) }] : []));
        if (conflicts.length) return { updated: [], conflicts };
        const updated = [];
        for (let i = 0; i < updates.length; i++) {
          const n: LooseNode = nodes[i]!;
          const p = updates[i]!.patch;
          if (typeof p.name === 'string') n.name = p.name;
          if (typeof p.x === 'number') n.x = p.x;
          if (typeof p.y === 'number') n.y = p.y;
          if (typeof p.width === 'number' || typeof p.height === 'number') n.resize((p.width as number) ?? n.width, (p.height as number) ?? n.height);
          if (typeof p.visible === 'boolean') n.visible = p.visible;
          if (typeof p.opacity === 'number') n.opacity = p.opacity;
          if (Array.isArray(p.fills) && 'fills' in n) n.fills = await toPaints(p.fills as PaintSpec[]);
          if (typeof p.cornerRadius === 'number' && 'cornerRadius' in n) n.cornerRadius = p.cornerRadius;
          if (typeof p.characters === 'string') {
            if (n.type !== 'TEXT') throw new OperationError(`${n.id} is not a text node`, 'invalid_operation');
            const fn = n.fontName;
            if (typeof fn === 'object' && 'family' in fn) await loadFont(fn.family, fn.style);
            n.characters = p.characters;
          }
          if (p.layout && 'layoutMode' in n) {
            const L = p.layout as NonNullable<NodeSpec['layout']>;
            n.layoutMode = L.mode;
            if (L.itemSpacing !== undefined) n.itemSpacing = L.itemSpacing;
          }
          if (!n.getPluginData(KEY_PID)) n.setPluginData('magec.touchedBy', projectId);
          updated.push({ nodeId: n.id, fingerprint: fingerprint(n) });
        }
        return { updated, conflicts: [] };
      }

      case 'delete_nodes': {
        const projectId = req<string>(op, 'projectId', 'string');
        if (typeof op.authorization !== 'string' || !op.authorization) throw new OperationError('delete_nodes requires an authorization id', 'permission_denied');
        const ownedOnly = op.ownedOnly !== false;
        const deleted: string[] = [];
        const skipped: string[] = [];
        for (const id of req<string[]>(op, 'nodeIds', 'array')) {
          const node = await api.getNodeByIdAsync(id);
          if (!node || node.removed) {
            skipped.push(id);
            continue;
          }
          if (node.type === 'PAGE' || node.type === 'DOCUMENT' || (ownedOnly && !isOwned(node, projectId))) {
            skipped.push(id);
            continue;
          }
          (node as SceneNode).remove();
          deleted.push(id);
        }
        return { deleted, skipped };
      }

      case 'upsert_variables': {
        const name = req<string>(op, 'collection', 'string');
        const modes = (op.modes as string[] | undefined) ?? ['Default'];
        const collections = await api.variables.getLocalVariableCollectionsAsync();
        let collection = collections.find((c) => c.name === name);
        if (!collection) {
          collection = api.variables.createVariableCollection(name);
          collection.renameMode(collection.modes[0]!.modeId, modes[0]!);
        }
        const modeIds = new Map(collection.modes.map((m) => [m.name, m.modeId]));
        for (const m of modes) {
          if (!modeIds.has(m)) {
            try {
              modeIds.set(m, collection.addMode(m));
            } catch (err) {
              throw new OperationError(`cannot add variable mode "${m}" (Figma plan limits may apply): ${(err as Error).message}`, 'unsupported_operation');
            }
          }
        }
        const existing = new Map((await api.variables.getLocalVariablesAsync()).filter((v) => v.variableCollectionId === collection!.id).map((v) => [v.name, v]));
        let created = 0;
        let updated = 0;
        for (const spec of req<Array<{ name: string; type: VariableResolvedDataType; values: Record<string, unknown> }>>(op, 'variables', 'array')) {
          let v = existing.get(spec.name);
          if (v && v.resolvedType !== spec.type) {
            v.remove();
            v = undefined;
          }
          if (!v) {
            v = api.variables.createVariable(spec.name, collection, spec.type);
            created++;
          } else {
            updated++;
          }
          for (const [mode, value] of Object.entries(spec.values)) {
            const modeId = modeIds.get(mode);
            if (!modeId) continue;
            v.setValueForMode(modeId, spec.type === 'COLOR' ? (() => { const c = hexToRgb(String(value)); return { r: c.r, g: c.g, b: c.b, a: c.a }; })() : (value as VariableValue));
          }
        }
        variableCache.clear();
        return { collectionId: collection.id, created, updated, modes: Object.fromEntries(modeIds) };
      }

      case 'upsert_text_styles': {
        const existing = new Map((await api.getLocalTextStylesAsync()).map((s) => [s.name, s]));
        const out = [];
        for (const s of req<Array<{ name: string; fontFamily: string; fontStyle: string; fontSize: number; lineHeight?: number | 'AUTO'; letterSpacing?: number }>>(op, 'styles', 'array')) {
          const font = await loadFont(s.fontFamily, s.fontStyle);
          const style = existing.get(s.name) ?? api.createTextStyle();
          style.name = s.name;
          style.fontName = font;
          style.fontSize = s.fontSize;
          if (s.lineHeight !== undefined) style.lineHeight = s.lineHeight === 'AUTO' ? { unit: 'AUTO' } : { unit: 'PIXELS', value: s.lineHeight };
          if (s.letterSpacing !== undefined) style.letterSpacing = { unit: 'PIXELS', value: s.letterSpacing };
          out.push({ name: s.name, id: style.id, created: !existing.has(s.name), fontFallback: font.family !== s.fontFamily });
        }
        return { styles: out, missingFonts: [...missingFonts] };
      }

      case 'upsert_paint_styles': {
        const existing = new Map((await api.getLocalPaintStylesAsync()).map((s) => [s.name, s]));
        const out = [];
        for (const s of req<Array<{ name: string; color: string }>>(op, 'styles', 'array')) {
          const style = existing.get(s.name) ?? api.createPaintStyle();
          style.name = s.name;
          const c = hexToRgb(s.color);
          style.paints = [{ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a }];
          out.push({ name: s.name, id: style.id, created: !existing.has(s.name) });
        }
        return { styles: out };
      }

      case 'combine_as_variants': {
        const projectId = req<string>(op, 'projectId', 'string');
        const lid = req<string>(op, 'logicalId', 'string');
        const comps: ComponentNode[] = [];
        for (const id of req<string[]>(op, 'componentNodeIds', 'array')) {
          const n = await getNode(id);
          if (n.type !== 'COMPONENT') throw new OperationError(`${id} is not a component`, 'invalid_operation');
          comps.push(n);
        }
        const index = await ownedIndex(api.root, projectId);
        let set = index.get(lid) as ComponentSetNode | undefined;
        if (set && set.type === 'COMPONENT_SET' && !set.removed) {
          for (const c of comps) if (c.parent !== set) set.appendChild(c);
        } else {
          const parent = comps[0]!.parent as ContainerNode;
          set = api.combineAsVariants(comps, parent as FrameNode | PageNode);
          set.layoutMode = 'HORIZONTAL';
          set.itemSpacing = 24;
          set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = 24;
          set.primaryAxisSizingMode = 'AUTO';
          set.counterAxisSizingMode = 'AUTO';
        }
        set.name = req<string>(op, 'name', 'string');
        set.setPluginData(KEY_PID, projectId);
        set.setPluginData(KEY_LID, lid);
        return { nodeId: set.id, fingerprint: fingerprint(set), variants: set.children.length };
      }

      case 'import_image': {
        const bytes = api.base64Decode(req<string>(op, 'base64', 'string'));
        const image = api.createImage(bytes);
        const size = await image.getSizeAsync();
        return { imageHash: image.hash, width: size.width, height: size.height };
      }

      case 'export_node': {
        const node = await getNode(req<string>(op, 'nodeId', 'string'));
        if (!('exportAsync' in node)) throw new OperationError(`${node.id} cannot be exported`, 'invalid_operation');
        const format = (op.format as 'PNG' | 'JPG' | 'SVG' | undefined) ?? 'PNG';
        const scale = typeof op.scale === 'number' ? op.scale : 1;
        const bytes = format === 'SVG' ? await (node as SceneNode).exportAsync({ format: 'SVG' }) : await (node as SceneNode).exportAsync({ format, constraint: { type: 'SCALE', value: scale } });
        return { base64: api.base64Encode(bytes), format, bytes: bytes.byteLength };
      }
    }
    throw new OperationError(`unhandled operation ${op.op}`, 'unsupported_operation');
  }

  return { execute };
}
