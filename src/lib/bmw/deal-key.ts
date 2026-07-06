import type { BmwDeal, DealKey } from '@/lib/bmw/types';

export function dealKey(deal: Pick<BmwDeal, 'paySource' | 'dealUid'>): DealKey {
  return `${deal.paySource}::${normalizeUid(deal.dealUid)}`;
}

export function normalizeUid(value: unknown): string {
  let s = String(value ?? '').trim().toLowerCase();
  // Excel often exports numeric IDs as "552988.0" — strip trailing ".0" for whole numbers.
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}
