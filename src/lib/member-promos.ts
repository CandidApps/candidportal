/** Supplier promos shown on Find Solutions. Display-only; not mixed into cash-back math. */

export type MemberPromo = {
  id: string;
  title: string;
  details?: string;
  /** YYYY-MM-DD. Hidden on the member portal after this date; still editable in admin. */
  expiresOn?: string;
};

const TITLE_MAX = 120;
const DETAILS_MAX = 400;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function newPromoId(): string {
  return `promo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyMemberPromos(): MemberPromo[] {
  return [];
}

export function newMemberPromo(): MemberPromo {
  return { id: newPromoId(), title: '' };
}

function parseExpiresOn(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return DATE_RE.test(value) ? value : undefined;
}

function parseOne(raw: unknown, index: number): MemberPromo | null {
  if (typeof raw === 'string') {
    const title = raw.trim().slice(0, TITLE_MAX);
    if (!title) return null;
    return { id: `promo-${index + 1}`, title };
  }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === 'string' ? row.title.trim().slice(0, TITLE_MAX) : '';
  if (!title) return null;
  const details =
    typeof row.details === 'string' ? row.details.trim().slice(0, DETAILS_MAX) : '';
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `promo-${index + 1}`;
  const expiresOn = parseExpiresOn(row.expiresOn ?? row.expires_on);
  return {
    id,
    title,
    ...(details ? { details } : {}),
    ...(expiresOn ? { expiresOn } : {}),
  };
}

export function parseMemberPromos(raw: unknown): MemberPromo[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseOne).filter((p): p is MemberPromo => p != null);
}

export function persistMemberPromos(promos: unknown): MemberPromo[] {
  return parseMemberPromos(promos).map((p, i) => ({
    ...p,
    id: p.id || `promo-${i + 1}`,
    title: p.title.trim().slice(0, TITLE_MAX),
    ...(p.details?.trim() ? { details: p.details.trim().slice(0, DETAILS_MAX) } : {}),
    ...(p.expiresOn ? { expiresOn: p.expiresOn } : {}),
  }));
}

export function isPromoExpired(promo: MemberPromo, today = new Date()): boolean {
  if (!promo.expiresOn) return false;
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return promo.expiresOn < `${y}-${m}-${d}`;
}

export function activeMemberPromos(promos: unknown): MemberPromo[] {
  return parseMemberPromos(promos).filter((p) => !isPromoExpired(p));
}

export function memberPromoBadge(promos: MemberPromo[] | null | undefined): string | null {
  const active = activeMemberPromos(promos);
  if (active.length === 0) return null;
  return active.length === 1 ? 'Promo' : `${active.length} promos`;
}

export function formatPromoExpiry(expiresOn: string): string {
  const [y, m, d] = expiresOn.split('-').map(Number);
  if (!y || !m || !d) return expiresOn;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
