/**
 * Known design-inspiration sources and how ui-ux-magec may access them. Access policies are conservative:
 * nothing here bypasses logins, paywalls or CAPTCHAs, and robots.txt is still checked at fetch time.
 */
export interface SourceDefinition {
  id: string;
  name: string;
  domains: string[];
  access: 'public-page' | 'api-key' | 'login-required';
  /** `site:` filter used when building search-engine queries. */
  siteQuery: string;
  strengths: string[];
  notes: string;
  /** Extracts a stable platform item id from a URL, used for deduplication. */
  itemId?: (url: URL) => string | undefined;
}

export const SOURCES: SourceDefinition[] = [
  {
    id: 'behance', name: 'Behance', domains: ['behance.net'], access: 'public-page', siteQuery: 'site:behance.net/gallery',
    strengths: ['full case studies', 'brand + UI systems', 'regional design work'],
    notes: 'No public search API (the Behance API is closed to new keys). Project pages are discovered via search providers or the host browser.',
    itemId: (u) => u.pathname.match(/\/gallery\/(\d+)/)?.[1],
  },
  {
    id: 'dribbble', name: 'Dribbble', domains: ['dribbble.com'], access: 'public-page', siteQuery: 'site:dribbble.com/shots',
    strengths: ['component-level shots', 'visual exploration', 'micro-interactions'],
    notes: 'The Dribbble API only exposes the authenticated user\'s own shots, so discovery uses search providers.',
    itemId: (u) => u.pathname.match(/\/shots\/(\d+)/)?.[1],
  },
  {
    id: 'awwwards', name: 'Awwwards', domains: ['awwwards.com'], access: 'public-page', siteQuery: 'site:awwwards.com/sites',
    strengths: ['award-winning production sites', 'motion and storytelling'],
    notes: 'Public site pages; links out to the live production site, which can be verified separately.',
    itemId: (u) => u.pathname.match(/\/sites\/([a-z0-9-]+)/i)?.[1],
  },
  {
    id: 'siteinspire', name: 'SiteInspire', domains: ['siteinspire.com'], access: 'public-page', siteQuery: 'site:siteinspire.com/websites',
    strengths: ['curated production websites', 'clean editorial layouts'], notes: 'Public gallery pages.',
    itemId: (u) => u.pathname.match(/\/websites\/(\d+)/)?.[1],
  },
  {
    id: 'land-book', name: 'Land-book', domains: ['land-book.com'], access: 'public-page', siteQuery: 'site:land-book.com/design',
    strengths: ['landing pages', 'hero sections'], notes: 'Public gallery pages.',
    itemId: (u) => u.pathname.match(/\/design\/([a-z0-9-]+)/i)?.[1],
  },
  {
    id: 'onepagelove', name: 'One Page Love', domains: ['onepagelove.com'], access: 'public-page', siteQuery: 'site:onepagelove.com',
    strengths: ['single-page sites', 'portfolios'], notes: 'Public gallery pages.',
  },
  {
    id: 'pinterest', name: 'Pinterest', domains: ['pinterest.com', 'pinterest.co.uk', 'pin.it'], access: 'api-key', siteQuery: 'site:pinterest.com/pin',
    strengths: ['broad moodboards', 'visual direction'],
    notes: 'Pinterest restricts automated access to many paths; the official API requires an approved app. Pins found by the host browser can be verified only if robots.txt allows the path.',
    itemId: (u) => u.pathname.match(/\/pin\/(\d+)/)?.[1],
  },
  {
    id: 'mobbin', name: 'Mobbin', domains: ['mobbin.com'], access: 'login-required', siteQuery: 'site:mobbin.com',
    strengths: ['real app screens and flows', 'mobile patterns'],
    notes: 'Content requires an account. ui-ux-magec never logs in or bypasses the paywall; Mobbin references can only be recorded when the user supplies them from their own session, and are marked unverified unless publicly retrievable.',
  },
];

export const GENERIC_SOURCE: SourceDefinition = {
  id: 'web', name: 'Production website', domains: [], access: 'public-page', siteQuery: '',
  strengths: ['real product behaviour', 'competitor analysis'], notes: 'Any public production or competitor website.',
};

export function sourceForUrl(url: string): SourceDefinition {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return GENERIC_SOURCE;
  }
  return SOURCES.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? GENERIC_SOURCE;
}

export function getSource(id: string): SourceDefinition | undefined {
  return id === 'web' ? GENERIC_SOURCE : SOURCES.find((s) => s.id === id);
}
