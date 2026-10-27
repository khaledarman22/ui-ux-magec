export interface Rgb { r: number; g: number; b: number; a: number }

export function parseHex(hex: string): Rgb {
  const m = hex.trim().match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m) throw new Error(`invalid hex color "${hex}"`);
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Composites a translucent foreground over an opaque background. */
export function composite(fg: string, bg: string, opacity = 1): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  const a = f.a * opacity;
  return toHex({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 });
}

export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: 1 });
}

export function isLargeText(fontSize: number, fontStyle = 'Regular'): boolean {
  const bold = /bold|black|heavy|semibold|extrabold/i.test(fontStyle);
  return fontSize >= 24 || (bold && fontSize >= 18.66);
}

/** WCAG AA threshold for the given text size. */
export function requiredContrast(fontSize: number, fontStyle?: string, level: 'AA' | 'AAA' = 'AA'): number {
  const large = isLargeText(fontSize, fontStyle);
  if (level === 'AAA') return large ? 4.5 : 7;
  return large ? 3 : 4.5;
}

/** Darkens or lightens `fg` toward black/white until it reaches `target` contrast against `bg`. */
export function ensureContrast(fg: string, bg: string, target = 4.5): string {
  if (contrastRatio(fg, bg) >= target) return toHex(parseHex(fg));
  const towards = luminance(bg) > 0.5 ? '#000000' : '#FFFFFF';
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(fg, towards, t);
    if (contrastRatio(c, bg) >= target) return c;
  }
  return towards;
}

/** Tonal ramp (50..900) around a base color, for palette generation. */
export function tonalRamp(base: string): Record<string, string> {
  const steps: Array<[string, string, number]> = [
    ['50', '#FFFFFF', 0.92], ['100', '#FFFFFF', 0.8], ['200', '#FFFFFF', 0.6], ['300', '#FFFFFF', 0.4], ['400', '#FFFFFF', 0.2],
    ['500', base, 0], ['600', '#000000', 0.15], ['700', '#000000', 0.3], ['800', '#000000', 0.45], ['900', '#000000', 0.6],
  ];
  return Object.fromEntries(steps.map(([k, to, t]) => [k, t === 0 ? toHex(parseHex(base)) : mix(base, to, t)]));
}

export function containsArabic(text: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
}
