import type { RawSpiffRow, SpiffImportLayout } from '@/lib/incentive-import/types';

type FieldKey =
  | 'sourceProgram'
  | 'provider'
  | 'category'
  | 'name'
  | 'description'
  | 'terms'
  | 'payout'
  | 'minMonthlyCharge'
  | 'minTerm'
  | 'payoutTimeline'
  | 'startsOn'
  | 'endsOn'
  | 'link'
  | 'priorFlag'
  | 'priorName'
  | 'priorDescription'
  | 'priorReward'
  | 'priorCriteria'
  | 'priorAdminNotes';

/** Header aliases in priority order; matched on normalized exact header text. */
const ALIASES: Record<FieldKey, string[]> = {
  sourceProgram: ['source', 'program', 'source program'],
  provider: ['provider', 'supplier', 'vendor', 'company', 'company name'],
  category: ['category'],
  name: ['name', 'promotion', 'promo', 'promotion name', 'incentive', 'program name'],
  description: ['internal description', 'description', 'product descriptions', 'spiff details', 'details'],
  terms: ['terms & conditions (internal reference)', 'terms & conditions', 'terms and conditions', 'terms', 'criteria'],
  payout: ['payout (internal)', 'payout', 'reward structure', 'reward', 'spiff amount'],
  minMonthlyCharge: ['minimum mrc requirement', 'minimum mrc', 'min mrc'],
  minTerm: ['minimum term requirement', 'minimum term', 'min term', 'term'],
  payoutTimeline: ['timeline for payout', 'payout timeline'],
  startsOn: ['start date', 'starts', 'start'],
  endsOn: ['expiration date', 'end date', 'expires', 'expiration', 'ends'],
  link: ['link to spiff', 'link', 'url', 'pdf(s)', 'pdf'],
  priorFlag: ['customer-facing appropriate?', 'customer facing appropriate?'],
  priorName: ['customer-facing name', 'customer facing name'],
  priorDescription: ['customer-facing description', 'customer facing description'],
  priorReward: ['customer-facing reward structure', 'customer facing reward structure'],
  priorCriteria: ['customer-facing criteria', 'customer facing criteria'],
  priorAdminNotes: ['admin notes'],
};

function normHeader(h: string): string {
  return h.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function mapHeaders(headers: string[]): Partial<Record<FieldKey, string>> {
  const byNorm = new Map(headers.map((h) => [normHeader(h), h]));
  const out: Partial<Record<FieldKey, string>> = {};
  for (const key of Object.keys(ALIASES) as FieldKey[]) {
    for (const alias of ALIASES[key]) {
      const hit = byNorm.get(alias);
      if (hit) {
        out[key] = hit;
        break;
      }
    }
  }
  return out;
}

export function detectLayout(headers: string[]): SpiffImportLayout | null {
  const set = new Set(headers.map(normHeader));
  if (set.has('payout (internal)') && set.has('customer-facing name')) return 'consolidated';
  if (set.has('reward structure') && set.has('name') && set.has('provider')) return 'appdirect';
  if (set.has('product descriptions') && set.has('payout')) return 'sandler';
  if (set.has('spiff details') && set.has('supplier')) return 'portal_export';
  const mapped = mapHeaders(headers);
  if (mapped.provider && (mapped.description || mapped.name || mapped.payout)) return 'generic';
  return null;
}

export const LAYOUT_DEFAULT_PROGRAM: Partial<Record<SpiffImportLayout, string>> = {
  appdirect: 'AppDirect',
  sandler: 'Sandler',
};

function excelSerialToIso(serial: number): string | undefined {
  if (serial < 20000 || serial > 80000) return undefined;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Accepts Date, Excel serial numbers, YYYY-MM-DD, M/D/YY(YY) and long-form dates. */
export function toIsoDate(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') return excelSerialToIso(raw);
  const s = String(raw).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (us) {
    const year = us[3]!.length === 2 ? `20${us[3]}` : us[3]!;
    return `${year}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString().slice(0, 10);
}

function text(row: Record<string, unknown>, header: string | undefined): string | undefined {
  if (!header) return undefined;
  const v = row[header];
  if (v == null) return undefined;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s && s.toUpperCase() !== 'N/A' ? s : undefined;
}

export function normalizeRows(
  records: Record<string, unknown>[],
  headers: string[],
  defaultProgram?: string,
): RawSpiffRow[] {
  const m = mapHeaders(headers);
  const rows: RawSpiffRow[] = [];
  records.forEach((r, i) => {
    const provider = text(r, m.provider);
    const description = text(r, m.description);
    const name = text(r, m.name);
    if (!provider && !description && !name) return;
    const prior = {
      flag: text(r, m.priorFlag),
      name: text(r, m.priorName),
      description: text(r, m.priorDescription),
      reward: text(r, m.priorReward),
      criteria: text(r, m.priorCriteria),
      adminNotes: text(r, m.priorAdminNotes),
    };
    rows.push({
      rowNumber: i + 2,
      sourceProgram: text(r, m.sourceProgram) ?? defaultProgram,
      provider,
      category: text(r, m.category),
      name,
      description,
      terms: text(r, m.terms),
      payout: text(r, m.payout),
      minMonthlyCharge: text(r, m.minMonthlyCharge),
      minTerm: text(r, m.minTerm),
      payoutTimeline: text(r, m.payoutTimeline),
      startsOn: toIsoDate(m.startsOn ? r[m.startsOn] : undefined),
      endsOn: toIsoDate(m.endsOn ? r[m.endsOn] : undefined),
      link: text(r, m.link),
      ...(Object.values(prior).some(Boolean) ? { prior } : {}),
    });
  });
  return rows;
}

function normKey(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Stable identity for re-imports of the same supplier SPIFF row. */
export function spiffImportKey(row: Pick<RawSpiffRow, 'provider' | 'sourceProgram' | 'name' | 'description' | 'payout' | 'endsOn'>): string {
  const parts = [
    normKey(row.provider),
    normKey(row.sourceProgram),
    normKey(row.name || row.description).slice(0, 200),
    normKey(row.payout),
    row.endsOn ?? '',
  ];
  return `spiff-${fnv1a(parts.join('|'))}`;
}
