import type { ServiceBreakdown, ServiceBreakdownLine } from '@/lib/customer-records';

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMrc\b/g, 'MRC')
    .replace(/\bMrr\b/g, 'MRR')
    .replace(/\bNrc\b/g, 'NRC')
    .replace(/\bIp\b/g, 'IP')
    .replace(/\bUcaas\b/g, 'UCaaS')
    .replace(/\bAta\b/g, 'ATA')
    .replace(/\bSip\b/g, 'SIP')
    .replace(/\bDect\b/g, 'DECT')
    .replace(/\bLte\b/g, 'LTE')
    .replace(/\b4g\b/gi, '4G');
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isLineItem(value: unknown): value is ServiceBreakdownLine {
  return typeof value === 'object' && value !== null && ('qty' in value || 'subtotal' in value);
}

/** Render portal service_breakdown objects as human-readable lines. */
export function formatServiceBreakdownLines(breakdown?: ServiceBreakdown): string[] {
  if (!breakdown) return [];
  const lines: string[] = [];
  for (const [key, value] of Object.entries(breakdown)) {
    if (value == null || value === '') continue;
    const label = humanizeKey(key);
    if (typeof value === 'number') {
      lines.push(`${label}: ${formatMoney(value)}`);
    } else if (typeof value === 'string') {
      lines.push(`${label}: ${value}`);
    } else if (isLineItem(value)) {
      const qty = value.qty ?? 1;
      const unit = value.unit_price ?? 0;
      const sub = value.subtotal ?? qty * unit;
      lines.push(`${label}: ${qty} × ${formatMoney(unit)} = ${formatMoney(sub)}`);
    }
  }
  return lines;
}
