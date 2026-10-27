import { DesignTokensSchema, type DesignTokens, type TypographyToken } from '@ui-ux-magec/schemas';
import { contrastRatio, ensureContrast, tonalRamp } from './color.js';

export function typeScale(opts: { base?: number; ratio?: number; fontFamily: string; headingFamily?: string }): Record<string, TypographyToken> {
  const base = opts.base ?? 16;
  const ratio = opts.ratio ?? 1.25;
  const size = (step: number) => Math.round(base * ratio ** step);
  const heading = opts.headingFamily ?? opts.fontFamily;
  const lh = (s: number, f: number) => Math.round(s * f);
  return {
    display: { fontFamily: heading, fontStyle: 'Bold', fontSize: size(5), lineHeight: lh(size(5), 1.1), letterSpacing: -1 },
    h1: { fontFamily: heading, fontStyle: 'Bold', fontSize: size(4), lineHeight: lh(size(4), 1.15), letterSpacing: -0.5 },
    h2: { fontFamily: heading, fontStyle: 'Bold', fontSize: size(3), lineHeight: lh(size(3), 1.2) },
    h3: { fontFamily: heading, fontStyle: 'Semi Bold', fontSize: size(2), lineHeight: lh(size(2), 1.25) },
    h4: { fontFamily: heading, fontStyle: 'Semi Bold', fontSize: size(1), lineHeight: lh(size(1), 1.3) },
    'body-lg': { fontFamily: opts.fontFamily, fontStyle: 'Regular', fontSize: size(1), lineHeight: lh(size(1), 1.55) },
    body: { fontFamily: opts.fontFamily, fontStyle: 'Regular', fontSize: base, lineHeight: lh(base, 1.55) },
    'body-sm': { fontFamily: opts.fontFamily, fontStyle: 'Regular', fontSize: size(-1), lineHeight: lh(size(-1), 1.5) },
    label: { fontFamily: opts.fontFamily, fontStyle: 'Medium', fontSize: size(-1), lineHeight: lh(size(-1), 1.3) },
    caption: { fontFamily: opts.fontFamily, fontStyle: 'Regular', fontSize: size(-2), lineHeight: lh(size(-2), 1.4) },
  };
}

export function spacingScale(base = 4): Record<string, number> {
  const steps: Array<[string, number]> = [['0', 0], ['3xs', 1], ['2xs', 2], ['xs', 3], ['sm', 4], ['md', 6], ['lg', 8], ['xl', 12], ['2xl', 16], ['3xl', 24], ['4xl', 32]];
  return Object.fromEntries(steps.map(([k, m]) => [k, base * m]));
}

export interface GenerateTokensInput {
  primary: string;
  secondary?: string;
  neutralBase?: string;
  background?: string;
  fontFamily: string;
  headingFamily?: string;
  arabicFamily?: string;
  baseFontSize?: number;
  scaleRatio?: number;
  spacingBase?: number;
  dark?: boolean;
}

/**
 * Deterministic token generation from a few brand inputs. Text colors are adjusted to meet WCAG AA against
 * the backgrounds they are meant for, so contrast is correct by construction.
 */
export function generateTokens(input: GenerateTokensInput): DesignTokens {
  const background = input.background ?? '#FFFFFF';
  const neutral = tonalRamp(input.neutralBase ?? '#64748B');
  const primary = tonalRamp(input.primary);
  const color: Record<string, string> = {
    background,
    surface: '#FFFFFF',
    'surface-muted': neutral['50']!,
    border: neutral['200']!,
    text: ensureContrast(neutral['900']!, background, 7),
    'text-muted': ensureContrast(neutral['600']!, background, 4.5),
    primary: primary['500']!,
    'primary-hover': primary['600']!,
    'primary-subtle': primary['50']!,
    'on-primary': contrastRatio('#FFFFFF', primary['500']!) >= 4.5 ? '#FFFFFF' : ensureContrast('#111111', primary['500']!, 4.5),
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
  };
  if (input.secondary) {
    const s = tonalRamp(input.secondary);
    color.secondary = s['500']!;
    color['secondary-subtle'] = s['50']!;
  }
  const themes: Record<string, Record<string, string>> = {};
  if (input.dark) {
    const darkBg = '#0B0F17';
    themes.dark = {
      background: darkBg, surface: '#121826', 'surface-muted': '#1A2233', border: '#273248',
      text: ensureContrast('#F1F5F9', darkBg, 7), 'text-muted': ensureContrast(neutral['300']!, darkBg, 4.5),
      primary: ensureContrast(primary['400']!, darkBg, 3), 'on-primary': '#0B0F17',
    };
  }
  return DesignTokensSchema.parse({
    color,
    themes,
    typography: typeScale({ base: input.baseFontSize ?? 16, ratio: input.scaleRatio ?? 1.25, fontFamily: input.fontFamily, ...(input.headingFamily ? { headingFamily: input.headingFamily } : {}) }),
    spacing: spacingScale(input.spacingBase ?? 4),
    radius: { none: 0, sm: 4, md: 8, lg: 16, xl: 24, full: 9999 },
    shadow: {
      sm: { type: 'DROP_SHADOW', color: '#0F172A1A', offsetX: 0, offsetY: 1, radius: 3, spread: 0 },
      md: { type: 'DROP_SHADOW', color: '#0F172A1F', offsetX: 0, offsetY: 8, radius: 24, spread: -4 },
      lg: { type: 'DROP_SHADOW', color: '#0F172A29', offsetX: 0, offsetY: 24, radius: 48, spread: -12 },
    },
    breakpoints: { desktop: 1440, tablet: 834, mobile: 390 },
    grid: { desktop: { columns: 12, gutter: 24, margin: 80 }, tablet: { columns: 8, gutter: 20, margin: 40 }, mobile: { columns: 4, gutter: 16, margin: 20 } },
    fonts: { primary: input.fontFamily, ...(input.headingFamily ? { secondary: input.headingFamily } : {}), ...(input.arabicFamily ? { arabic: input.arabicFamily } : {}) },
  });
}

export interface TokenIssue {
  level: 'error' | 'warning';
  message: string;
}

/** Checks token-level accessibility: text/background and on-primary pairs must meet WCAG AA. */
export function auditTokens(tokens: DesignTokens): TokenIssue[] {
  const issues: TokenIssue[] = [];
  const pairs: Array<[string, string, number]> = [['text', 'background', 4.5], ['text-muted', 'background', 4.5], ['on-primary', 'primary', 4.5], ['text', 'surface', 4.5]];
  const themes: Array<[string, Record<string, string>]> = [['base', tokens.color], ...Object.entries(tokens.themes).map(([n, t]) => [n, { ...tokens.color, ...t }] as [string, Record<string, string>])];
  for (const [theme, palette] of themes) {
    for (const [fg, bg, min] of pairs) {
      if (!palette[fg] || !palette[bg]) continue;
      const ratio = contrastRatio(palette[fg]!, palette[bg]!);
      if (ratio < min) issues.push({ level: 'error', message: `${theme}: ${fg} on ${bg} has contrast ${ratio.toFixed(2)} (< ${min})` });
    }
  }
  const sizes = Object.values(tokens.typography).map((t) => t.fontSize);
  if (Math.min(...sizes) < 12) issues.push({ level: 'warning', message: 'smallest type size is below 12px' });
  if (!tokens.fonts.arabic) issues.push({ level: 'warning', message: 'no Arabic font defined (required for RTL screens)' });
  return issues;
}
