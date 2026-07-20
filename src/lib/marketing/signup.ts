import type { SolutionCategoryId } from '@/lib/solutions/catalog';

export type SignupIntent = 'quote' | 'analysis';

export type SignupPrefill = {
  intent?: SignupIntent;
  category?: SolutionCategoryId | string;
  vendor?: string;
  q?: string;
};

/** Build a link into the portal signup / prospect flow from marketing pages. */
export function buildSignupHref(opts: SignupPrefill = {}): string {
  const p = new URLSearchParams();
  p.set('signup', '1');
  if (opts.intent) p.set('intent', opts.intent);
  if (opts.category) p.set('category', opts.category);
  if (opts.vendor) p.set('vendor', opts.vendor);
  if (opts.q?.trim()) p.set('q', opts.q.trim());
  return `/?${p.toString()}`;
}

export function parseSignupPrefill(
  sp: Record<string, string | string[] | undefined>,
): SignupPrefill | null {
  const get = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const signup = get('signup');
  if (signup !== '1' && signup !== 'true') return null;
  const intentRaw = get('intent');
  const intent: SignupIntent | undefined =
    intentRaw === 'quote' || intentRaw === 'analysis' ? intentRaw : undefined;
  return {
    intent,
    category: get('category') || undefined,
    vendor: get('vendor') || undefined,
    q: get('q') || undefined,
  };
}
