import { DEAL_BASE_SERVICES, DEAL_SERVICE_DETAILS_BY_BASE } from '@/lib/crm/deal-service-taxonomy';

/** Muted hues aligned with portal indigo/slate chips (readable detail pills). */
const BASE_SERVICE_HUES: Record<string, { h: number; s: number }> = {
  'Payment Solutions': { h: 350, s: 48 },
  Communications: { h: 234, s: 50 },
  Connectivity: { h: 199, s: 46 },
  'Cloud / SaaS': { h: 258, s: 48 },
  Security: { h: 28, s: 50 },
  'SD-WAN': { h: 168, s: 42 },
  'Managed Services': { h: 43, s: 46 },
  Mobility: { h: 278, s: 44 },
  'Web Services': { h: 178, s: 42 },
  Other: { h: 222, s: 22 },
};

const DEFAULT_HUE = { h: 234, s: 34 };

export function canonicalBaseServiceName(base: string): string {
  const trimmed = base.trim();
  if (!trimmed) return '';
  const match = DEAL_BASE_SERVICES.find((b) => b.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

export function inferBaseServiceForDetail(detail: string): string {
  const key = detail.trim().toLowerCase();
  if (!key) return 'Other';
  for (const base of DEAL_BASE_SERVICES) {
    const details = DEAL_SERVICE_DETAILS_BY_BASE[base];
    if (details.some((d) => d.toLowerCase() === key)) return base;
  }
  return 'Other';
}

export type DealServiceBadgeHue = { h: number; s: number };

export function dealServiceBadgeHue(baseService: string): DealServiceBadgeHue {
  const canonical = canonicalBaseServiceName(baseService) || 'Other';
  return BASE_SERVICE_HUES[canonical] ?? DEFAULT_HUE;
}
