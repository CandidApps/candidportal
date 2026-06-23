export const FEE_OCCURRENCES = [
  'per_transaction',
  'per_month',
  'per_year',
  'per_occurrence',
  'per_call',
  'per_volume',
] as const;

export type FeeOccurrence = (typeof FEE_OCCURRENCES)[number];

export const FEE_APPLIED_ON_OPTIONS = [
  'app',
  'credit_card',
  'debit_card',
  'ach',
  'rdc',
  'other',
] as const;

export type FeeAppliedOn = (typeof FEE_APPLIED_ON_OPTIONS)[number];

export const FEE_TIER_APPLIED_OPTIONS = ['mid_risk', 'high_risk'] as const;

export type FeeTierApplied = (typeof FEE_TIER_APPLIED_OPTIONS)[number];

export const FEE_OCCURRENCE_LABELS: Record<FeeOccurrence, string> = {
  per_transaction: 'Per transaction',
  per_month: 'Per month',
  per_year: 'Per year',
  per_occurrence: 'Per occurrence',
  per_call: 'Per call',
  per_volume: 'Per volume',
};

export const FEE_APPLIED_ON_LABELS: Record<FeeAppliedOn, string> = {
  app: 'App',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  ach: 'ACH',
  rdc: 'RDC',
  other: 'Other',
};

export const FEE_TIER_APPLIED_LABELS: Record<FeeTierApplied, string> = {
  mid_risk: 'Medium risk',
  high_risk: 'High risk',
};

export type ScheduleARateLine = {
  id: string;
  section: string;
  item: string;
  buyRate: string;
  revenueShare?: string;
  notes?: string;
  /** How often this fee is charged. */
  feeOccurrence?: FeeOccurrence;
  /** Payment products / channels this fee applies to (multi-select). */
  feeAppliedOn?: FeeAppliedOn[];
  /** Risk tiers when this fee applies; empty = all tiers. */
  tierApplied?: FeeTierApplied[];
  /** Within reseller compensation section: revenue tier vs partner pass-through fee. */
  resellerLineKind?: ResellerLineKind;
};

export const LEGACY_RESELLER_COMPENSATION_SECTION = 'Reseller Compensation Tier';

export const RESELLER_COMPENSATION_SECTION = 'Reseller Compensation Tiers and Fees';

export const RESELLER_LINE_KINDS = ['compensation_tier', 'partner_fee'] as const;

export type ResellerLineKind = (typeof RESELLER_LINE_KINDS)[number];

export type RevenueShareChoice = '' | 'Yes' | 'No';

export const REVENUE_SHARE_CHOICES: RevenueShareChoice[] = ['', 'Yes', 'No'];

export const SCHEDULE_A_SECTIONS = [
  'Card Processing',
  'ACH / eCheck',
  'Monthly Fees',
  'Per-Item Fees',
  'Chargebacks',
  'Risk',
  'General',
] as const;

export type ScheduleASection = (typeof SCHEDULE_A_SECTIONS)[number];

const SECTION_ALIASES: Record<string, ScheduleASection | typeof RESELLER_COMPENSATION_SECTION> = {
  'card processing': 'Card Processing',
  card: 'Card Processing',
  interchange: 'Card Processing',
  'ach / echeck': 'ACH / eCheck',
  ach: 'ACH / eCheck',
  echeck: 'ACH / eCheck',
  'ach/echeck': 'ACH / eCheck',
  gateway: 'ACH / eCheck',
  'monthly fees': 'Monthly Fees',
  monthly: 'Monthly Fees',
  'per-item fees': 'Per-Item Fees',
  'per item fees': 'Per-Item Fees',
  transaction: 'Per-Item Fees',
  chargebacks: 'Chargebacks',
  chargeback: 'Chargebacks',
  risk: 'Risk',
  general: 'General',
  other: 'General',
  'reseller compensation tier': RESELLER_COMPENSATION_SECTION,
  'reseller compensation tiers and fees': RESELLER_COMPENSATION_SECTION,
};

export function normalizeScheduleASection(section?: string | null): string {
  const trimmed = section?.trim();
  if (!trimmed) return 'General';
  if (trimmed === LEGACY_RESELLER_COMPENSATION_SECTION) return RESELLER_COMPENSATION_SECTION;
  if ((SCHEDULE_A_SECTIONS as readonly string[]).includes(trimmed)) return trimmed;
  if (trimmed === RESELLER_COMPENSATION_SECTION) return RESELLER_COMPENSATION_SECTION;
  const alias = SECTION_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  return trimmed;
}

export function isResellerCompensationSection(section?: string | null): boolean {
  const normalized = normalizeScheduleASection(section);
  return (
    normalized === RESELLER_COMPENSATION_SECTION ||
    normalized === LEGACY_RESELLER_COMPENSATION_SECTION
  );
}

export function inferResellerLineKind(line: ScheduleARateLine): ResellerLineKind {
  const hay = `${line.item} ${line.notes ?? ''} ${line.buyRate}`.toLowerCase();
  const rate = line.buyRate.trim().toLowerCase();
  if (line.item.toLowerCase().includes('revenue share') || /\d+\s*%/.test(line.revenueShare ?? '')) {
    return 'compensation_tier';
  }
  if (rate && rate !== 'n/a' && rate !== '—' && rate !== '-' && rate !== 'na') {
    return 'partner_fee';
  }
  if (hay.includes('fee') && !hay.includes('revenue share')) return 'partner_fee';
  return 'compensation_tier';
}

export function isPartnerFeeLine(line: ScheduleARateLine): boolean {
  return isResellerCompensationSection(line.section) && line.resellerLineKind === 'partner_fee';
}

export function isCompensationTierLine(line: ScheduleARateLine): boolean {
  return isResellerCompensationSection(line.section) && line.resellerLineKind !== 'partner_fee';
}

export function revenueShareToChoice(value?: string | null): RevenueShareChoice {
  if (!value?.trim()) return '';
  const lower = value.trim().toLowerCase();
  if (lower === 'no' || lower === 'n/a' || lower === 'none') return 'No';
  return 'Yes';
}

export function migrateScheduleALine(line: ScheduleARateLine): ScheduleARateLine {
  const section = normalizeScheduleASection(line.section);
  const migrated: ScheduleARateLine = { ...line, section };
  if (isResellerCompensationSection(section)) {
    migrated.resellerLineKind = line.resellerLineKind ?? inferResellerLineKind(migrated);
  }
  return migrated;
}

export function migrateScheduleALines(lines: ScheduleARateLine[]): ScheduleARateLine[] {
  return lines.map(migrateScheduleALine);
}

export function scheduleASectionOptions(lines: ScheduleARateLine[]): string[] {
  const extras = new Set<string>();
  for (const line of lines) {
    const normalized = normalizeScheduleASection(line.section);
    if (
      !(SCHEDULE_A_SECTIONS as readonly string[]).includes(normalized) &&
      !isResellerCompensationSection(normalized)
    ) {
      extras.add(normalized);
    }
  }
  return [...SCHEDULE_A_SECTIONS, ...Array.from(extras).sort((a, b) => a.localeCompare(b))];
}

export function groupScheduleALinesBySection(lines: ScheduleARateLine[]): { section: string; lines: ScheduleARateLine[] }[] {
  const sectionOrder = scheduleASectionOptions(lines);
  const buckets = new Map<string, ScheduleARateLine[]>();

  for (const line of lines) {
    const section = normalizeScheduleASection(line.section);
    const bucket = buckets.get(section) ?? [];
    bucket.push({ ...line, section });
    buckets.set(section, bucket);
  }

  const ordered: { section: string; lines: ScheduleARateLine[] }[] = [];
  for (const section of sectionOrder) {
    if (isResellerCompensationSection(section)) continue;
    const bucket = buckets.get(section);
    if (bucket?.length) ordered.push({ section, lines: bucket });
  }

  for (const [section, bucket] of buckets) {
    if (
      !sectionOrder.includes(section) &&
      !isResellerCompensationSection(section) &&
      bucket.length
    ) {
      ordered.push({ section, lines: bucket });
    }
  }

  return ordered;
}

export type ScheduleARecord = {
  providerId: string;
  providerDbId?: number;
  documentId?: string;
  filename?: string;
  storagePath?: string;
  lines: ScheduleARateLine[];
  parsedAt?: string;
  updatedAt?: string;
};

export type ScheduleAParseResult = {
  lines: ScheduleARateLine[];
  summary?: string;
};

export function newScheduleALine(partial?: Partial<ScheduleARateLine>): ScheduleARateLine {
  return {
    id: `sa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    section: normalizeScheduleASection(partial?.section),
    item: partial?.item ?? '',
    buyRate: partial?.buyRate ?? '',
    revenueShare: partial?.revenueShare,
    notes: partial?.notes,
    feeOccurrence: partial?.feeOccurrence,
    feeAppliedOn: partial?.feeAppliedOn?.length ? [...partial.feeAppliedOn] : undefined,
    tierApplied: partial?.tierApplied?.length ? [...partial.tierApplied] : undefined,
    resellerLineKind: partial?.resellerLineKind,
  };
}

export function newCompensationTierLine(partial?: Partial<ScheduleARateLine>): ScheduleARateLine {
  return migrateScheduleALine(
    newScheduleALine({
      section: RESELLER_COMPENSATION_SECTION,
      resellerLineKind: 'compensation_tier',
      buyRate: 'N/A',
      ...partial,
    }),
  );
}

export function newPartnerFeeLine(partial?: Partial<ScheduleARateLine>): ScheduleARateLine {
  return migrateScheduleALine(
    newScheduleALine({
      section: RESELLER_COMPENSATION_SECTION,
      resellerLineKind: 'partner_fee',
      revenueShare: undefined,
      ...partial,
    }),
  );
}
