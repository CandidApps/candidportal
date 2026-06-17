import { commissionPeriodFromPostingMonth } from '@/lib/commissions/period-utils';

export type ChaseRawRow = Record<string, unknown>;

export type ParsedChaseRow = {
  lineIndex: number;
  details: string | null;
  postingDate: string;
  description: string;
  amount: number;
  sheetType: string | null;
  sheetSource: string | null;
  origCoName: string | null;
  origId: string | null;
  commissionPeriod: string | null;
};

const CHASE_COLUMNS = {
  details: ['Details', 'details'],
  postingDate: ['Posting Date', 'Posting date', 'Date'],
  description: ['Description', 'description'],
  amount: ['Amount', 'amount'],
  type: ['Type', 'type'],
  source: ['Source', 'source'],
};

function pickColumn(row: ChaseRawRow, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row && row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

export function parseMoney(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value).trim();
  const negative = s.includes('(') && s.includes(')');
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

export function parseOrigCoName(description: string): string | null {
  const match = description.match(/ORIG CO NAME:([^]+?)\s+ORIG ID:/i);
  if (!match?.[1]) return null;
  return match[1].trim().replace(/\s+/g, ' ');
}

export function parseOrigId(description: string): string | null {
  const match = description.match(/ORIG ID:([A-Z0-9]+)/i);
  return match?.[1]?.trim() ?? null;
}

function parsePostingPeriod(postingDate: string): string | null {
  const s = postingDate.trim();
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return null;
  const month = Number(slash[1]);
  const yearPart = Number(slash[3]);
  const year = yearPart < 100 ? 2000 + yearPart : yearPart;
  if (!month || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function postingDateToIso(postingDate: string): string {
  const period = parsePostingPeriod(postingDate);
  if (!period) return postingDate;
  const [y, m] = period.split('-');
  const slash = postingDate.match(/^(\d{1,2})\/(\d{1,2})\//);
  const day = slash ? String(Number(slash[2])).padStart(2, '0') : '01';
  return `${y}-${m}-${day}`;
}

export function normalizeDepositType(raw: string | null): string {
  if (!raw) return 'Other';
  const t = raw.trim();
  if (!t) return 'Other';
  if (/commission/i.test(t)) return 'Commission';
  if (/paid invoice/i.test(t)) return 'Paid Invoice';
  if (/passthrough/i.test(t)) return 'Passthrough';
  return t;
}

export function parseChaseSheetRows(rawRows: ChaseRawRow[]): ParsedChaseRow[] {
  return rawRows
    .map((row, lineIndex) => {
      const postingDateRaw = pickColumn(row, CHASE_COLUMNS.postingDate);
      const descriptionRaw = pickColumn(row, CHASE_COLUMNS.description);
      if (!postingDateRaw || !descriptionRaw) return null;

      const postingDate = String(postingDateRaw).trim();
      const description = String(descriptionRaw).trim();
      const amount = parseMoney(pickColumn(row, CHASE_COLUMNS.amount));

      return {
        lineIndex,
        details: pickColumn(row, CHASE_COLUMNS.details)
          ? String(pickColumn(row, CHASE_COLUMNS.details)).trim()
          : null,
        postingDate,
        description,
        amount,
        sheetType: pickColumn(row, CHASE_COLUMNS.type)
          ? String(pickColumn(row, CHASE_COLUMNS.type)).trim()
          : null,
        sheetSource: pickColumn(row, CHASE_COLUMNS.source)
          ? String(pickColumn(row, CHASE_COLUMNS.source)).trim()
          : null,
        origCoName: parseOrigCoName(description),
        origId: parseOrigId(description),
        // Deposits post ~1 month after the commission period they pay out (May deposit → June commission).
        commissionPeriod: commissionPeriodFromPostingMonth(parsePostingPeriod(postingDate)),
      };
    })
    .filter((row): row is ParsedChaseRow => row != null);
}

export function importPeriodRange(rows: ParsedChaseRow[]): { start: string | null; end: string | null } {
  const periods = rows
    .map((r) => r.commissionPeriod)
    .filter((p): p is string => !!p)
    .sort();
  if (!periods.length) return { start: null, end: null };
  return { start: periods[0]!, end: periods[periods.length - 1]! };
}
