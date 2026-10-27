import type { FeedbackInterpretation, FeedbackIntent } from '@ui-ux-magec/schemas';

export interface FeedbackVocabulary {
  pages: Array<{ slug: string; name: string }>;
  sections: Array<{ id: string; name: string; page?: string }>;
}

const has = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));

const INTENT_PATTERNS: Array<[FeedbackIntent, RegExp[]]> = [
  ['approve', [/\b(approve|approved|looks? (great|good)|perfect|ship it|go ahead with)\b/, /(موافق|ممتاز|اعتمد|اعتماد|جميل جدا)/]],
  ['remove', [/\b(remove|delete|drop|get rid of)\b/, /(احذف|أزل|ازل|شيل|إزالة)/]],
  ['new-concept', [/\b(another|new|different|alternative) (concept|direction)\b/, /\bgenerate (another|a new) concept\b/, /(مفهوم (آخر|جديد)|اتجاه (آخر|جديد))/]],
  ['reject-direction', [/\b(do ?n[o']?t|don't|dont) like (this|the) (visual )?(direction|style|concept)\b/, /\bwrong direction\b/, /(لا يعجبني (هذا )?(الاتجاه|الأسلوب|الستايل))/]],
  ['redesign', [/\b(re-?design|completely different|start over|from scratch|rethink)\b/, /\b(do ?n[o']?t|don't|dont) like\b/, /(أعد تصميم|اعادة تصميم|إعادة تصميم|مختلف تماما|مختلف تمامًا|لا يعجبني)/]],
  ['review', [/\b(review|audit|check|inspect|look at)\b/, /(راجع|مراجعة|افحص|دقق)/]],
  ['add', [/\b(add|include|introduce|we need (a|an))\b/, /(أضف|اضف|إضافة)/]],
  ['refine', [/\b(more|less|too|make (it|the|this)|bolder|stronger|softer|warmer|cooler|increase|decrease|bigger|smaller|tighter|looser|improve|adjust|tweak|crowded|cramped|busy|plain|boring)\b/, /(أكثر|اكثر|أقل|اقل|حسّن|حسن|عدّل|عدل|مزدحم|فاخر|فخام|خلي|خلّي|اجعل)/]],
];

const ATTRIBUTES: Array<[string, RegExp]> = [
  ['premium', /(premium|luxur|high-end|elegant|فاخر|فخام|فخم|راقي)/],
  ['creative', /(creative|unique|distinctive|bold idea|إبداع|مبتكر)/],
  ['less-conventional', /(less conventional|unconventional|not generic|too generic|غير تقليدي)/],
  ['more-whitespace', /(crowded|cramped|busy|too tight|more (white ?)?space|breathing room|مزدحم|مساحة)/],
  ['minimal', /(minimal|simpler|cleaner|simplify|بسيط|أبسط)/],
  ['bolder', /(bolder|stronger|more contrast|punchier|أقوى|جريء)/],
  ['playful', /(playful|fun|friendly|مرح)/],
  ['typography', /(typography|font|typeface|خط|خطوط)/],
  ['color', /(colou?r|palette|لون|ألوان)/],
  ['imagery', /(image|photo|imagery|visual|صورة|صور)/],
  ['accessibility', /(accessib|contrast|readab|وصول|تباين)/],
];

const GENERIC_SECTIONS = ['hero', 'header', 'navigation', 'nav', 'footer', 'pricing', 'testimonials', 'faq', 'features', 'gallery', 'contact', 'cta', 'search', 'filters', 'cards', 'sidebar', 'checkout', 'cart', 'form', 'about', 'team', 'blog', 'listing', 'map'];
const AR_SECTIONS: Record<string, string> = { 'الهيرو': 'hero', 'الواجهة': 'hero', 'الهيدر': 'header', 'الترويسة': 'header', 'الفوتر': 'footer', 'التذييل': 'footer', 'الأسعار': 'pricing', 'البحث': 'search', 'الفلاتر': 'filters', 'القائمة': 'navigation' };

function detectBreakpoints(t: string): Array<'desktop' | 'tablet' | 'mobile'> {
  const out: Array<'desktop' | 'tablet' | 'mobile'> = [];
  if (/(mobile|phone|جوال|موبايل|الهاتف)/.test(t)) out.push('mobile');
  if (/(tablet|ipad|تابلت|اللوحي)/.test(t)) out.push('tablet');
  if (/(desktop|سطح المكتب|ديسكتوب)/.test(t)) out.push('desktop');
  return out;
}

/**
 * Rule-based, bilingual (en/ar) feedback interpreter. It is deliberately conservative: destructive requests
 * without an identifiable scope are flagged for clarification instead of guessing.
 */
export function interpretFeedback(text: string, vocab: FeedbackVocabulary): FeedbackInterpretation {
  const t = text.toLowerCase();
  const clauses = t.split(/\bbut\b|،|لكن|ولكن|\bhowever\b|;/);
  const preserveClauses = clauses.filter((c) => /\b(keep|preserve|retain|leave)\b|(حافظ|أبق|ابق|اترك)/.test(c));
  const actionText = clauses.filter((c) => !preserveClauses.includes(c)).join(' ') || t;

  let intent: FeedbackIntent = 'general';
  let confidence = 0.4;
  for (const [candidate, patterns] of INTENT_PATTERNS) {
    if (has(actionText, patterns)) {
      intent = candidate;
      confidence = 0.75;
      break;
    }
  }
  if (intent === 'general' && preserveClauses.length) {
    intent = 'preserve';
    confidence = 0.7;
  }

  const findSections = (s: string): string[] => {
    const found = new Set<string>();
    for (const sec of vocab.sections) if (s.includes(sec.id.toLowerCase()) || s.includes(sec.name.toLowerCase())) found.add(sec.id);
    for (const g of GENERIC_SECTIONS) if (new RegExp(`\\b${g}\\b`).test(s)) found.add(g === 'nav' ? 'navigation' : g);
    for (const [ar, id] of Object.entries(AR_SECTIONS)) if (s.includes(ar)) found.add(id);
    return [...found];
  };
  const findPages = (s: string): string[] => vocab.pages.filter((p) => new RegExp(`\\b${p.slug.replace(/-/g, '[- ]')}\\b`).test(s) || s.includes(p.name.toLowerCase())).map((p) => p.slug);

  const sections = findSections(actionText);
  const pages = findPages(actionText);
  const breakpoints = detectBreakpoints(actionText);
  const attributesOf = (s: string) => ATTRIBUTES.filter(([, re]) => re.test(s)).map(([a]) => a);
  // Things to keep: named sections/pages, or attributes such as "the colors" ("keep the colors").
  const preserve = [...new Set(preserveClauses.flatMap((c) => [...findSections(c), ...findPages(c).map((p) => `page:${p}`), ...attributesOf(c)]))];
  const attributes = attributesOf(actionText).filter((a) => !preserve.includes(a));

  let level: FeedbackInterpretation['scope']['level'] = 'project';
  if (sections.length) level = 'section';
  else if (pages.length) level = 'page';
  else if (breakpoints.length) level = 'breakpoint';
  else if (/(design system|tokens|نظام التصميم)/.test(t)) level = 'design-system';
  // "the hero" without a page: if exactly one page has that section, scope it; else keep all pages.
  const scopedPages = pages.length ? pages : vocab.sections.filter((s) => sections.includes(s.id) && s.page).map((s) => s.page!);

  // A redesign that names a section is a section redesign; one without scope is a request for a new concept.
  if (intent === 'redesign' && level === 'project') intent = 'new-concept';
  // "I don't like the hero, create a different concept" is a scoped redesign, not a project-wide new direction.
  if ((intent === 'new-concept' || intent === 'reject-direction') && (level === 'section' || level === 'page')) intent = 'redesign';
  if (intent === 'review' && level === 'project' && breakpoints.length) level = 'breakpoint';

  const needsClarification = intent === 'remove' && level === 'project';
  if (attributes.length && intent === 'general') {
    intent = 'refine';
    confidence = 0.6;
  }
  return {
    intent,
    scope: { level, pages: [...new Set(scopedPages)], sections, breakpoints },
    attributes,
    preserve,
    confidence: needsClarification ? Math.min(confidence, 0.4) : confidence,
    needsClarification,
    ...(needsClarification ? { clarificationQuestion: 'What exactly should be removed (which page or section)? Nothing will be deleted until you confirm.' } : {}),
  };
}
