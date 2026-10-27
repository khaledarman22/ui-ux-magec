const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$|si$|share$)/i;

/** Normalizes a URL so the same page reached through different links compares equal. */
export function canonicalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return input.trim().toLowerCase();
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  u.protocol = 'https:';
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = keep.length ? `?${new URLSearchParams(keep).toString()}` : '';
  let path = u.pathname.replace(/\/+$/, '') || '/';
  // Platform slugs change while ids stay stable: /gallery/123/old-title == /gallery/123/new-title.
  path = path.replace(/^(\/gallery\/\d+)(\/.*)?$/, '$1').replace(/^(\/shots\/\d+)(-[^/]*)?$/, '$1');
  u.pathname = path;
  return u.toString().replace(/\/$/, '');
}

export function titleTokens(title: string): Set<string> {
  return new Set(title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
