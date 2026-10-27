export interface PageMetadata {
  title: string;
  description: string;
  image?: string;
  canonical?: string;
  siteName?: string;
  /** Heuristic: page looks like a login/paywall interstitial rather than the requested content. */
  loginWall: boolean;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function metaContent(html: string, attr: 'property' | 'name', key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key.replace(/[:.]/g, '\\$&')}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return undefined;
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content.trim()) : undefined;
}

export function extractMetadata(html: string, baseUrl: string): PageMetadata {
  const head = html.slice(0, 300_000);
  const title = metaContent(head, 'property', 'og:title') ?? decodeEntities(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '');
  const description = metaContent(head, 'property', 'og:description') ?? metaContent(head, 'name', 'description') ?? '';
  const rawImage = metaContent(head, 'property', 'og:image') ?? metaContent(head, 'name', 'twitter:image') ?? metaContent(head, 'property', 'og:image:url');
  const canonicalHref = head.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  const resolve = (u?: string) => {
    if (!u) return undefined;
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return undefined;
    }
  };
  const lower = `${title} ${head.slice(0, 20_000)}`.toLowerCase();
  // A page titled "Sign in"/"Log in" that contains a password field is a login form, not the requested content.
  const loginForm = /^\s*(sign ?in|log ?in|login)\b/.test(title.toLowerCase()) && /<input[^>]+type=["']?password/i.test(head);
  const loginWall = loginForm || /(log ?in|sign ?in) to (continue|view|see)|create an account to|subscribe to (view|continue)|access denied|are you a robot|captcha/.test(lower);
  return {
    title: title.slice(0, 300),
    description: description.slice(0, 1000),
    ...(resolve(rawImage) ? { image: resolve(rawImage)! } : {}),
    ...(resolve(canonicalHref) ? { canonical: resolve(canonicalHref)! } : {}),
    ...(metaContent(head, 'property', 'og:site_name') ? { siteName: metaContent(head, 'property', 'og:site_name')! } : {}),
    loginWall,
  };
}
