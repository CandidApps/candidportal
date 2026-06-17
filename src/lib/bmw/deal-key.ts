import type { BmwDeal, DealKey } from '@/lib/bmw/types';

export function dealKey(deal: Pick<BmwDeal, 'paySource' | 'dealUid'>): DealKey {
  return `${deal.paySource}::${normalizeUid(deal.dealUid)}`;
}

export function normalizeUid(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}
