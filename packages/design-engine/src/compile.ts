import {
  DesignSpecSchema, hashJson,
  type ComponentSpec, type DesignNode, type DesignSpecInput, type DesignTokens, type NodeSpec, type PaintSpec, type ScreenSpec, type TypographyToken,
} from '@ui-ux-magec/schemas';
import { containsArabic } from './color.js';

export class DesignCompileError extends Error {
  constructor(public readonly errors: string[]) {
    super(`design spec failed to compile:\n - ${errors.join('\n - ')}`);
  }
}

export interface CompiledScreen {
  screenId: string;
  page: string;
  breakpoint: ScreenSpec['breakpoint'];
  direction: 'ltr' | 'rtl';
  tree: NodeSpec;
  specHash: string;
}

export interface CompiledComponent {
  componentId: string;
  name: string;
  page: string;
  setLogicalId: string;
  variants: Array<{ props: Record<string, string>; tree: NodeSpec; specHash: string }>;
}

export interface CompiledDesign {
  pages: string[];
  components: CompiledComponent[];
  screens: CompiledScreen[];
  warnings: string[];
}

interface Ctx {
  tokens: DesignTokens;
  theme: string;
  direction: 'ltr' | 'rtl';
  errors: string[];
  warnings: string[];
  componentIds: Set<string>;
}

type TokenValue = string | number | TypographyToken | NodeSpec['effects'];

function resolveToken(ref: string, ctx: Ctx, where: string): TokenValue | undefined {
  const m = ref.match(/^\$([a-z0-9]+)\.(.+)$/i);
  if (!m) return ref;
  const [, group, name] = m as unknown as [string, string, string];
  const t = ctx.tokens;
  let value: TokenValue | undefined;
  switch (group) {
    case 'color': value = t.themes[ctx.theme]?.[name] ?? t.color[name]; break;
    case 'spacing': case 'space': value = t.spacing[name]; break;
    case 'radius': value = t.radius[name]; break;
    case 'type': case 'typography': value = t.typography[name]; break;
    case 'shadow': value = t.shadow[name] ? [t.shadow[name]!] : undefined; break;
    default: value = undefined;
  }
  if (value === undefined) ctx.errors.push(`${where}: unknown token ${ref}`);
  return value;
}

function num(v: number | string | undefined, ctx: Ctx, where: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  const r = resolveToken(v, ctx, where);
  if (typeof r !== 'number') {
    if (r !== undefined) ctx.errors.push(`${where}: token ${v} is not a number`);
    return undefined;
  }
  return r;
}

function color(v: string | undefined, ctx: Ctx, where: string): string | undefined {
  if (v === undefined) return undefined;
  if (!v.startsWith('$')) return v;
  const r = resolveToken(v, ctx, where);
  if (typeof r !== 'string') {
    if (r !== undefined) ctx.errors.push(`${where}: token ${v} is not a color`);
    return undefined;
  }
  return r;
}

function solid(hex: string | undefined, variable?: string): PaintSpec[] | undefined {
  return hex ? [{ type: 'SOLID', color: hex, ...(variable ? { variable } : {}) }] : undefined;
}

/** Variable name for a color token reference, e.g. `$color.primary` -> `color/primary` (bound when present). */
function variableFor(ref: string | undefined): string | undefined {
  const m = ref?.match(/^\$color\.(.+)$/);
  return m ? `color/${m[1]}` : undefined;
}

const JUSTIFY = { start: 'MIN', center: 'CENTER', end: 'MAX', 'space-between': 'SPACE_BETWEEN' } as const;
const ALIGN = { start: 'MIN', center: 'CENTER', end: 'MAX', baseline: 'BASELINE' } as const;

function flipStartEnd<T extends string>(v: T, flip: boolean): T {
  if (!flip) return v;
  return (v === 'start' ? 'end' : v === 'end' ? 'start' : v) as T;
}

function sizing(v: DesignNode['width'], parentAuto: boolean, ctx: Ctx, where: string): { mode?: 'FIXED' | 'HUG' | 'FILL'; value?: number } {
  if (v === undefined) return {};
  if (v === 'fill') {
    if (!parentAuto) ctx.warnings.push(`${where}: "fill" sizing needs an auto-layout parent; using fixed size`);
    return parentAuto ? { mode: 'FILL' } : {};
  }
  if (v === 'hug') return { mode: 'HUG' };
  return { mode: 'FIXED', value: v };
}

function compileNode(node: DesignNode, parentLogical: string, parentAuto: boolean, parentLayout: 'row' | 'column' | undefined, ctx: Ctx): NodeSpec {
  const logicalId = `${parentLogical}/${node.id}`;
  const where = logicalId;
  const rtl = ctx.direction === 'rtl';
  const out: NodeSpec = { logicalId, type: node.type, name: node.name ?? node.id };
  // Auto layout everywhere: positions only exist for overlays (absolute children of an auto-layout frame).
  if (node.absolute && !parentAuto) ctx.errors.push(`${where}: "absolute" needs an auto-layout parent`);
  if ((node.x !== undefined || node.y !== undefined) && parentAuto && !node.absolute) {
    ctx.errors.push(`${where}: x/y are not allowed inside auto layout; use gap/padding/alignment, or "absolute": true for an overlay`);
  }
  if (node.x !== undefined) out.x = node.x;
  if (node.y !== undefined) out.y = node.y;
  const w = sizing(node.width, parentAuto, ctx, where);
  const h = sizing(node.height, parentAuto, ctx, where);
  if (w.value) out.width = w.value;
  if (h.value) out.height = h.value;
  if (parentAuto && w.mode) out.layoutSizingHorizontal = w.mode;
  if (parentAuto && h.mode) out.layoutSizingVertical = h.mode;
  if (node.absolute) out.layoutPositioning = 'ABSOLUTE';
  if (node.opacity !== undefined) out.opacity = node.opacity;
  if (node.fills) out.fills = node.fills;
  else if (node.type !== 'TEXT' && node.fill) out.fills = solid(color(node.fill, ctx, where), variableFor(node.fill));
  if (node.stroke) out.strokes = solid(color(node.stroke, ctx, where), variableFor(node.stroke));
  if (node.strokeWeight !== undefined) out.strokeWeight = node.strokeWeight;
  if (node.radius !== undefined) {
    const r = num(node.radius, ctx, where);
    if (r !== undefined) out.cornerRadius = r;
  }
  if (node.shadow) {
    const s = resolveToken(node.shadow, ctx, where);
    if (Array.isArray(s)) out.effects = s;
  }
  if (node.clip !== undefined) out.clipsContent = node.clip;
  const meta: Record<string, string> = { ...(node.meta ?? {}) };
  if (node.placeholder) meta.placeholder = 'true';
  if (rtl) meta.direction = 'rtl';

  if (node.type === 'TEXT') {
    if (node.text === undefined) ctx.errors.push(`${where}: TEXT node requires "text"`);
    const style = node.textStyle ? resolveToken(node.textStyle, ctx, where) : undefined;
    const typo = (style && typeof style === 'object' && !Array.isArray(style) ? style : undefined) as TypographyToken | undefined;
    if (!typo) ctx.errors.push(`${where}: TEXT node requires a valid "textStyle" token`);
    const characters = node.text ?? '';
    const arabic = containsArabic(characters);
    let fontFamily = typo?.fontFamily ?? ctx.tokens.fonts.primary;
    if (arabic && ctx.tokens.fonts.arabic) fontFamily = ctx.tokens.fonts.arabic;
    else if (arabic) ctx.warnings.push(`${where}: Arabic text but no Arabic font token; "${fontFamily}" may not support Arabic glyphs`);
    const logical = node.align ?? 'start';
    const align = logical === 'center' ? 'CENTER' : logical === 'justify' ? 'JUSTIFIED' : (logical === 'start') !== rtl ? 'LEFT' : 'RIGHT';
    const autoResize = node.maxLines ? 'TRUNCATE' : w.mode === 'FILL' || w.mode === 'FIXED' ? 'HEIGHT' : 'WIDTH_AND_HEIGHT';
    out.text = {
      characters, fontFamily, fontStyle: typo?.fontStyle ?? 'Regular', fontSize: typo?.fontSize ?? 16,
      ...(typo?.lineHeight ? { lineHeight: typo.lineHeight } : {}),
      ...(typo?.letterSpacing !== undefined && !arabic ? { letterSpacing: typo.letterSpacing } : {}),
      align, autoResize, ...(node.maxLines ? { maxLines: node.maxLines } : {}),
    };
    // Arabic text links the Arabic text styles created by magec_figma_sync_tokens (type-ar/*).
    if (node.textStyle) out.textStyle = node.textStyle.replace(/^\$(type|typography)\./, arabic && ctx.tokens.fonts.arabic ? 'type-ar/' : 'type/');
    out.fills = solid(color(node.color ?? '$color.text', ctx, where), variableFor(node.color ?? '$color.text'));
  }

  if (node.layout) {
    const L = node.layout;
    const row = L.direction === 'row';
    const mirrorMain = rtl && row;
    const mirrorCounter = rtl && !row;
    out.layout = {
      mode: row ? 'HORIZONTAL' : 'VERTICAL',
      ...(L.gap !== undefined ? { itemSpacing: num(L.gap, ctx, where) ?? 0 } : {}),
      ...(L.rowGap !== undefined ? { counterAxisSpacing: num(L.rowGap, ctx, where) ?? 0 } : {}),
      ...(L.justify ? { primaryAxisAlign: JUSTIFY[flipStartEnd(L.justify, mirrorMain)] } : {}),
      ...(L.align ? { counterAxisAlign: ALIGN[flipStartEnd(L.align, mirrorCounter)] } : {}),
      ...(L.wrap ? { wrap: true } : {}),
    };
    if (L.padding !== undefined) {
      const p = Array.isArray(L.padding) ? L.padding.map((v) => num(v, ctx, where) ?? 0) : [num(L.padding, ctx, where) ?? 0];
      let [top, right, bottom, left] = p.length === 1 ? [p[0]!, p[0]!, p[0]!, p[0]!] : p.length === 2 ? [p[0]!, p[1]!, p[0]!, p[1]!] : [p[0]!, p[1]!, p[2]!, p[3]!];
      if (rtl) [right, left] = [left, right];
      out.layout.padding = { top, right, bottom, left };
    }
  } else if (node.children?.length) {
    ctx.errors.push(`${where}: a frame with children must use auto layout (add "layout": { "direction": "row" | "column", ... })`);
  }

  if (node.type === 'INSTANCE') {
    if (!node.componentRef) ctx.errors.push(`${where}: INSTANCE requires componentRef`);
    else {
      // "button", "button/variant=primary" or "component/button/..." -> the variant's logical id (same normalisation as below).
      const [cid, ...rest] = node.componentRef.replace(/^component\//, '').split('/');
      out.componentRef = ctx.componentIds.has(cid!)
        ? rest.length ? `component/${cid}/${normalizeVariant(rest.join('/'))}` : `component/${cid}`
        : node.componentRef;
    }
    if (node.overrides) out.overrides = node.overrides;
  }
  if (node.image) ctx.errors.push(`${where}: image "${node.image}" was not resolved; apply the spec with magec_figma_apply_spec`);
  if (node.icon) ctx.errors.push(`${where}: icon "${node.icon}" was not resolved; apply the spec with magec_figma_apply_spec`);
  if (node.type === 'SVG') {
    if (!node.svg) ctx.errors.push(`${where}: SVG requires svg markup`);
    else out.svg = node.svg;
  }
  if (Object.keys(meta).length) out.meta = meta;

  if (node.children?.length) {
    const ids = new Set<string>();
    for (const c of node.children) {
      if (ids.has(c.id)) ctx.errors.push(`${where}: duplicate child id "${c.id}"`);
      ids.add(c.id);
    }
    // Repeated elements (cards, list items, stats...) must be one component with instances, not copies.
    const bySignature = new Map<string, string[]>();
    for (const c of node.children) {
      if (c.type === 'INSTANCE' || !c.children?.length) continue;
      const sig = structureSignature(c);
      bySignature.set(sig, [...(bySignature.get(sig) ?? []), c.id]);
    }
    for (const ids of bySignature.values()) {
      if (ids.length > 1) ctx.errors.push(`${where}: children ${ids.map((i) => `"${i}"`).join(', ')} repeat the same structure; define it once as a component (it may live on this page) and use INSTANCE nodes with overrides`);
    }
    const auto = !!node.layout;
    let children = node.children.map((c) => compileNode(c, logicalId, auto, node.layout?.direction, ctx));
    // RTL rows read right-to-left: reversing the auto-layout order mirrors the visual sequence.
    if (rtl && node.layout?.direction === 'row') children = children.reverse();
    out.children = children;
  }
  return out;
}

/** Shape of a subtree (types, layout directions, nesting), ignoring content, used to spot repeated copies. */
function structureSignature(n: DesignNode): string {
  const own = n.type === 'INSTANCE' ? `I:${n.componentRef ?? ''}` : `${n.type}${n.layout ? `:${n.layout.direction}` : ''}`;
  return n.children?.length ? `${own}(${n.children.map(structureSignature).join(',')})` : own;
}

function variantKey(props: Record<string, string>): string {
  return Object.entries(props).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',') || 'default';
}

function compileComponent(c: ComponentSpec, ctx: Ctx): CompiledComponent {
  return {
    componentId: c.id,
    name: c.name,
    page: c.page,
    setLogicalId: `componentset/${c.id}`,
    variants: c.variants.map((v) => {
      const key = variantKey(v.props);
      const inner = compileNode({ ...v.node, id: key.replace(/[^a-z0-9_-]/gi, '_') }, `component/${c.id}`, false, undefined, ctx);
      const tree: NodeSpec = {
        ...inner,
        logicalId: `component/${c.id}/${normalizeVariant(key)}`,
        type: 'COMPONENT',
        name: c.variants.length > 1 ? Object.entries(v.props).map(([k, val]) => `${k}=${val}`).join(', ') : c.name,
      };
      return { props: v.props, tree, specHash: hashJson(tree) };
    }),
  };
}

/**
 * Compiles an agent-authored design spec into fully resolved Figma node trees: tokens are resolved, logical
 * alignment and row order are mirrored for RTL, Arabic text gets the Arabic font, and every node receives
 * a stable logicalId so re-applying the same spec updates nodes instead of duplicating them.
 */
/** Variant part of a component logical id: `variant=primary,size=lg` -> `variant-primary-size-lg`. */
function normalizeVariant(key: string): string {
  return key.replace(/[^a-z0-9_=,-]/gi, '_').replace(/[=,]/g, '-');
}

export function compileDesign(input: DesignSpecInput, tokens: DesignTokens): CompiledDesign {
  const spec = DesignSpecSchema.parse(input);
  const errors: string[] = [];
  const warnings: string[] = [];
  const componentIds = new Set(spec.components.map((c) => c.id));
  const base: Omit<Ctx, 'theme' | 'direction'> = { tokens, errors, warnings, componentIds };
  const components = spec.components.map((c) => compileComponent(c, { ...base, theme: 'light', direction: 'ltr' }));
  // Components (design-system or page-level) sit in a column left of the screens so nothing overlaps.
  const componentRow = new Map<string, number>();
  for (const comp of components) {
    for (const v of comp.variants) {
      const y = componentRow.get(comp.page) ?? 0;
      componentRow.set(comp.page, y + (v.tree.height ?? 120) + 80);
      v.tree.x = -((v.tree.width ?? 360) + 240);
      v.tree.y = y;
      v.specHash = hashJson(v.tree);
    }
  }
  const pageCursor = new Map<string, number>();
  const screenIds = new Set<string>();
  const screens: CompiledScreen[] = spec.screens.map((s) => {
    if (screenIds.has(s.id)) errors.push(`duplicate screen id "${s.id}"`);
    screenIds.add(s.id);
    const ctx: Ctx = { ...base, theme: s.theme, direction: s.direction };
    const width = s.width ?? tokens.breakpoints[s.breakpoint] ?? (s.breakpoint === 'mobile' ? 390 : s.breakpoint === 'tablet' ? 834 : 1440);
    const x = s.x ?? pageCursor.get(s.page) ?? 0;
    pageCursor.set(s.page, x + width + 160);
    const logicalId = `screen/${s.id}`;
    const bg = color(s.background, ctx, logicalId);
    const tree: NodeSpec = {
      logicalId,
      type: 'FRAME',
      name: `${s.name} — ${s.breakpoint}${s.direction === 'rtl' ? ' (RTL)' : ''}`,
      x, y: s.y ?? 0,
      width,
      ...(s.minHeight ? { height: s.minHeight } : {}),
      layout: { mode: 'VERTICAL', itemSpacing: num(s.gap ?? 0, ctx, logicalId) ?? 0 },
      layoutSizingVertical: s.minHeight ? 'FIXED' : 'HUG',
      clipsContent: true,
      ...(bg ? { fills: solid(bg, variableFor(typeof s.background === 'string' ? s.background : undefined)) } : {}),
      meta: { screen: s.id, breakpoint: s.breakpoint, direction: s.direction, theme: s.theme },
      children: s.sections.map((sec) => compileNode({ ...sec, width: sec.width ?? 'fill' }, logicalId, true, 'column', ctx)),
    };
    return { screenId: s.id, page: s.page, breakpoint: s.breakpoint, direction: s.direction, tree, specHash: hashJson(tree) };
  });
  if (errors.length) throw new DesignCompileError(errors);
  const pages = [...new Set([...components.map((c) => c.page), ...screens.map((s) => s.page)])];
  return { pages, components, screens, warnings };
}

/** Flattens a node tree (depth-first) — handy for mappings and QA. */
export function flattenSpec(tree: NodeSpec): NodeSpec[] {
  const out: NodeSpec[] = [tree];
  for (const c of tree.children ?? []) out.push(...flattenSpec(c));
  return out;
}

/** Figma variables payload for the token set (colors per theme mode, spacing and radius as numbers). */
export function tokensToVariables(tokens: DesignTokens): { modes: string[]; variables: Array<{ name: string; type: 'COLOR' | 'FLOAT'; values: Record<string, string | number> }> } {
  const modes = ['light', ...Object.keys(tokens.themes)];
  const variables: Array<{ name: string; type: 'COLOR' | 'FLOAT'; values: Record<string, string | number> }> = [];
  for (const [name, hex] of Object.entries(tokens.color)) {
    const values: Record<string, string> = {};
    for (const m of modes) values[m] = m === 'light' ? hex : tokens.themes[m]?.[name] ?? hex;
    variables.push({ name: `color/${name}`, type: 'COLOR', values });
  }
  for (const [name, v] of Object.entries(tokens.spacing)) variables.push({ name: `spacing/${name}`, type: 'FLOAT', values: Object.fromEntries(modes.map((m) => [m, v])) });
  for (const [name, v] of Object.entries(tokens.radius)) variables.push({ name: `radius/${name}`, type: 'FLOAT', values: Object.fromEntries(modes.map((m) => [m, Math.min(v, 1000)])) });
  return { modes, variables };
}
