import { z } from 'zod';
import { EffectSpecSchema, HexColorSchema, NodeTypeSpecSchema, PaintSpecSchema } from './figma.js';

/* ---------- Tokens ---------- */

export const TypographyTokenSchema = z.object({
  fontFamily: z.string(),
  fontStyle: z.string().default('Regular'),
  fontSize: z.number().positive(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
});
export type TypographyToken = z.infer<typeof TypographyTokenSchema>;

export const BreakpointNameSchema = z.enum(['desktop', 'tablet', 'mobile']);
export type BreakpointName = z.infer<typeof BreakpointNameSchema>;

export const DesignTokensSchema = z.object({
  color: z.record(z.string(), HexColorSchema),
  /** Per-theme overrides of `color` (e.g. dark). */
  themes: z.record(z.string(), z.record(z.string(), HexColorSchema)).default({}),
  typography: z.record(z.string(), TypographyTokenSchema),
  spacing: z.record(z.string(), z.number().min(0)),
  radius: z.record(z.string(), z.number().min(0)).default({}),
  shadow: z.record(z.string(), EffectSpecSchema).default({}),
  breakpoints: z.partialRecord(BreakpointNameSchema, z.number().positive()).default({ desktop: 1440, tablet: 834, mobile: 390 }),
  grid: z.partialRecord(BreakpointNameSchema, z.object({ columns: z.number().int(), gutter: z.number(), margin: z.number() })).default({}),
  fonts: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    arabic: z.string().optional(),
  }),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

/* ---------- Design spec (authored by agents, compiled to NodeSpec) ---------- */

/** `$group.name` references a token, e.g. `$color.primary`, `$spacing.lg`, `$type.h1`. */
export const TokenRefSchema = z.string().regex(/^\$[a-z][a-z0-9]*\.[a-z0-9._-]+$/i);
const NumOrToken = z.union([z.number(), TokenRefSchema]);
const ColorOrToken = z.union([HexColorSchema, TokenRefSchema]);

const DesignNodeBaseSchema = z.object({
  /** Local id, unique among siblings. The compiled logicalId is `<screen>/<path of ids>`. */
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i),
  type: NodeTypeSpecSchema.default('FRAME'),
  name: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.union([z.number().positive(), z.literal('fill'), z.literal('hug')]).optional(),
  height: z.union([z.number().positive(), z.literal('fill'), z.literal('hug')]).optional(),
  fill: ColorOrToken.optional(),
  fills: z.array(PaintSpecSchema).optional(),
  stroke: ColorOrToken.optional(),
  strokeWeight: z.number().min(0).optional(),
  radius: NumOrToken.optional(),
  shadow: TokenRefSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  clip: z.boolean().optional(),
  absolute: z.boolean().optional(),
  layout: z.object({
    direction: z.enum(['row', 'column']),
    gap: NumOrToken.optional(),
    padding: z.union([NumOrToken, z.tuple([NumOrToken, NumOrToken]), z.tuple([NumOrToken, NumOrToken, NumOrToken, NumOrToken])]).optional(),
    /** Logical main-axis alignment; `start`/`end` flip for RTL rows. */
    justify: z.enum(['start', 'center', 'end', 'space-between']).optional(),
    align: z.enum(['start', 'center', 'end', 'baseline']).optional(),
    wrap: z.boolean().optional(),
    rowGap: NumOrToken.optional(),
  }).optional(),
  text: z.string().optional(),
  textStyle: TokenRefSchema.optional(),
  color: ColorOrToken.optional(),
  /** Logical text alignment; `start` is right-aligned in RTL screens. */
  align: z.enum(['start', 'center', 'end', 'justify']).optional(),
  maxLines: z.number().int().positive().optional(),
  svg: z.string().optional(),
  /** Image from the asset library (assets/images/...), placed as an IMAGE fill; resolved when the spec is applied. */
  image: z.string().regex(/^assets\//).optional(),
  imageScale: z.enum(['FILL', 'FIT', 'CROP', 'TILE']).optional(),
  /** Icon from the asset library (assets/icons/*.svg), placed as an editable vector tinted with `color`. */
  icon: z.string().regex(/^assets\/icons\/[^/]+\.svg$/).optional(),
  componentRef: z.string().optional(),
  overrides: z.record(z.string(), z.string()).optional(),
  /** Marks content that must be replaced before hand-off (e.g. stock imagery not yet sourced). */
  placeholder: z.boolean().optional(),
  meta: z.record(z.string(), z.string()).optional(),
});
export type DesignNode = z.output<typeof DesignNodeBaseSchema> & { children?: DesignNode[] };
export type DesignNodeInput = z.input<typeof DesignNodeBaseSchema> & { children?: DesignNodeInput[] };
export const DesignNodeSchema: z.ZodType<DesignNode, DesignNodeInput> = DesignNodeBaseSchema.extend({
  get children(): z.ZodOptional<z.ZodArray<z.ZodType<DesignNode, DesignNodeInput>>> {
    return z.array(DesignNodeSchema).optional();
  },
});

export const ScreenSpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string(),
  page: z.string(),
  breakpoint: BreakpointNameSchema,
  width: z.number().positive().optional(),
  minHeight: z.number().positive().optional(),
  direction: z.enum(['ltr', 'rtl']).default('ltr'),
  theme: z.string().default('light'),
  background: ColorOrToken.default('$color.background'),
  x: z.number().optional(),
  y: z.number().optional(),
  gap: NumOrToken.optional(),
  sections: z.array(DesignNodeSchema).min(1),
});
export type ScreenSpec = z.infer<typeof ScreenSpecSchema>;

export const ComponentSpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string(),
  page: z.string().default('Components'),
  /** Each variant becomes a COMPONENT; more than one variant is combined into a component set. */
  variants: z.array(z.object({
    props: z.record(z.string(), z.string()),
    node: DesignNodeSchema,
  })).min(1),
});
export type ComponentSpec = z.infer<typeof ComponentSpecSchema>;

export const DesignSpecSchema = z.object({
  specVersion: z.literal(1),
  conceptId: z.string().optional(),
  components: z.array(ComponentSpecSchema).default([]),
  screens: z.array(ScreenSpecSchema).default([]),
});
export type DesignSpec = z.infer<typeof DesignSpecSchema>;
export type DesignSpecInput = z.input<typeof DesignSpecSchema>;

/* ---------- Design system (design-system-agent contract) ---------- */

export const DesignSystemSpecSchema = z.object({
  tokens: DesignTokensSchema,
  components: z.array(z.object({
    id: z.string(),
    name: z.string(),
    purpose: z.string(),
    variants: z.array(z.string()).default([]),
    states: z.array(z.string()).default([]),
    anatomy: z.array(z.string()).default([]),
    responsive: z.string().optional(),
    accessibility: z.array(z.string()).default([]),
  })),
  layoutRules: z.array(z.string()).default([]),
  accessibilityRules: z.array(z.string()).default([]),
  rtlRules: z.array(z.string()).default([]),
});
export type DesignSystemSpec = z.infer<typeof DesignSystemSpecSchema>;
