import { parseScheduleRate } from '@/lib/analysis/our-rate-savings';
import type { MerchantRiskTier } from '@/lib/analysis/merchant-risk';
import {
  FEE_APPLIED_ON_OPTIONS,
  FEE_OCCURRENCES,
  FEE_TIER_APPLIED_OPTIONS,
  migrateScheduleALine,
  normalizeScheduleASection,
  type FeeAppliedOn,
  type FeeOccurrence,
  type FeeTierApplied,
  type ScheduleARateLine,
} from '@/lib/schedule-a-types';

export type MarginProductKey = 'cc' | 'ach' | 'rdc' | 'pin_debit';

const PRODUCT_TO_APPLIED: Record<MarginProductKey, FeeAppliedOn[]> = {
  cc: ['credit_card'],
  pin_debit: ['debit_card'],
  ach: ['ach', 'app'],
  rdc: ['rdc'],
};

function lineHaystack(line: ScheduleARateLine): string {
  return `${line.section} ${line.item} ${line.notes ?? ''} ${line.buyRate}`.toLowerCase();
}

function parseFeeOccurrence(raw: unknown): FeeOccurrence | undefined {
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  const aliases: Record<string, FeeOccurrence> = {
    per_transaction: 'per_transaction',
    transaction: 'per_transaction',
    per_txn: 'per_transaction',
    per_month: 'per_month',
    monthly: 'per_month',
    per_year: 'per_year',
    annual: 'per_year',
    yearly: 'per_year',
    per_occurrence: 'per_occurrence',
    occurrence: 'per_occurrence',
    per_call: 'per_call',
    call: 'per_call',
    per_volume: 'per_volume',
    volume: 'per_volume',
    bps: 'per_volume',
  };
  return aliases[key] ?? (FEE_OCCURRENCES.includes(key as FeeOccurrence) ? (key as FeeOccurrence) : undefined);
}

function parseFeeAppliedOnList(raw: unknown): FeeAppliedOn[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .map((v) => String(v).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_'))
    .filter((v): v is FeeAppliedOn => (FEE_APPLIED_ON_OPTIONS as readonly string[]).includes(v));
  return values.length ? values : undefined;
}

function parseTierAppliedList(raw: unknown): FeeTierApplied[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .map((v) => String(v).trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_'))
    .map((v) => (v === 'medium_risk' ? 'mid_risk' : v))
    .filter((v): v is FeeTierApplied => (FEE_TIER_APPLIED_OPTIONS as readonly string[]).includes(v));
  return values.length ? values : undefined;
}

/** Best-effort metadata from section, item, notes, and buy rate (legacy / PDF import). */
export function inferScheduleLineMetadata(line: ScheduleARateLine): {
  feeOccurrence: FeeOccurrence;
  feeAppliedOn: FeeAppliedOn[];
  tierApplied: FeeTierApplied[];
} {
  const hay = lineHaystack(line);
  const section = normalizeScheduleASection(line.section);
  const parsed = parseScheduleRate(line.buyRate);

  let feeOccurrence: FeeOccurrence;
  const isAnnualLine =
    line.item.toLowerCase().includes('annual') ||
    hay.includes('1099k') ||
    (hay.includes('annual') && !hay.includes('/mo') && !hay.includes('monthly'));

  if (parsed?.kind === 'bps' || hay.includes('bps') || (parsed?.kind === 'percent' && hay.includes('funding'))) {
    feeOccurrence = 'per_volume';
  } else if (hay.includes('per call') || hay.includes('voice auth')) {
    feeOccurrence = 'per_call';
  } else if (
    section === 'Chargebacks' ||
    hay.includes('per occurrence') ||
    hay.includes('one time') ||
    hay.includes('one-time')
  ) {
    feeOccurrence = 'per_occurrence';
  } else if (isAnnualLine || hay.includes('/yr') || hay.includes('per year')) {
    feeOccurrence = 'per_year';
  } else if (hay.includes('monthly') || hay.includes('/mo') || section === 'Monthly Fees') {
    feeOccurrence = 'per_month';
  } else if (
    section === 'Per-Item Fees' ||
    hay.includes('per item') ||
    hay.includes('per transaction') ||
    hay.includes('per tran') ||
    (parsed?.kind === 'per_item')
  ) {
    feeOccurrence = 'per_transaction';
  } else if (section === 'Card Processing' || hay.includes('interchange')) {
    feeOccurrence = 'per_volume';
  } else if (parsed?.kind === 'monthly') {
    feeOccurrence = 'per_month';
  } else if (parsed?.kind === 'annual') {
    feeOccurrence = 'per_year';
  } else {
    feeOccurrence = 'per_month';
  }

  const feeAppliedOn: FeeAppliedOn[] = [];
  const isPinDebit =
    hay.includes('pin debit') ||
    line.item.trim().toLowerCase() === 'pin debit' ||
    (/\bpin\b/.test(hay) && /\bdebit\b/.test(hay) && !hay.includes('credit card'));

  if (hay.includes('rdc') || hay.includes('remote deposit')) feeAppliedOn.push('rdc');
  if (isPinDebit) {
    feeAppliedOn.push('debit_card');
  }
  if (/\bach\b/.test(hay) || hay.includes('echeck') || hay.includes('e-check')) feeAppliedOn.push('ach');
  if (hay.includes('gateway') || hay.includes('client id')) feeAppliedOn.push('app');
  if (
    !isPinDebit &&
    (hay.includes('amex') ||
      hay.includes('visa') ||
      hay.includes('mastercard') ||
      hay.includes('interchange') ||
      hay.includes('v/mc') ||
      section === 'Card Processing' ||
      section === 'Monthly Fees' ||
      section === 'Per-Item Fees' ||
      section === 'Chargebacks')
  ) {
    if (!feeAppliedOn.includes('credit_card')) feeAppliedOn.push('credit_card');
  }
  if (feeAppliedOn.length === 0) {
    if (section === 'ACH / eCheck') feeAppliedOn.push('ach');
    else feeAppliedOn.push('other');
  }

  const tierApplied: FeeTierApplied[] = [];
  if (hay.includes('mid risk')) tierApplied.push('mid_risk');
  if (hay.includes('high risk') || hay.includes('sponsor bank risk premium')) tierApplied.push('high_risk');

  return { feeOccurrence, feeAppliedOn, tierApplied };
}

export function resolveFeeOccurrence(line: ScheduleARateLine): FeeOccurrence {
  return line.feeOccurrence ?? inferScheduleLineMetadata(line).feeOccurrence;
}

export function resolveFeeAppliedOn(line: ScheduleARateLine): FeeAppliedOn[] {
  return line.feeAppliedOn?.length ? line.feeAppliedOn : inferScheduleLineMetadata(line).feeAppliedOn;
}

export function resolveTierApplied(line: ScheduleARateLine): FeeTierApplied[] {
  return line.tierApplied?.length ? line.tierApplied : inferScheduleLineMetadata(line).tierApplied;
}

export function lineAppliesToRiskTier(line: ScheduleARateLine, tier: MerchantRiskTier): boolean {
  const tiers = resolveTierApplied(line);
  if (!tiers.length) return true;
  if (tiers.includes('high_risk') && tier === 'high') return true;
  if (tiers.includes('mid_risk') && (tier === 'mid' || tier === 'high')) return true;
  return false;
}

export function lineAppliesToMarginProduct(line: ScheduleARateLine, product: MarginProductKey): boolean {
  const applied = resolveFeeAppliedOn(line);
  if (applied.includes('other')) {
    return legacyClassifyProduct(line) === product;
  }
  return PRODUCT_TO_APPLIED[product].some((key) => applied.includes(key));
}

export function primaryMarginProduct(line: ScheduleARateLine): MarginProductKey {
  const applied = resolveFeeAppliedOn(line);
  if (applied.includes('rdc')) return 'rdc';
  if (applied.includes('debit_card')) return 'pin_debit';
  if (applied.includes('ach') || applied.includes('app')) return 'ach';
  if (applied.includes('credit_card')) return 'cc';
  return legacyClassifyProduct(line);
}

function legacyClassifyProduct(line: ScheduleARateLine): MarginProductKey {
  const hay = lineHaystack(line);
  if (hay.includes('rdc') || hay.includes('remote deposit')) return 'rdc';
  if (hay.includes('pin debit') || (/\bpin\b/.test(hay) && /\bdebit\b/.test(hay))) return 'pin_debit';
  if (/\bach\b/.test(hay) || hay.includes('echeck') || normalizeScheduleASection(line.section) === 'ACH / eCheck') {
    return 'ach';
  }
  return 'cc';
}

export function isPinDebitLine(line: ScheduleARateLine): boolean {
  const hay = lineHaystack(line);
  return (
    hay.includes('pin debit') ||
    line.item.trim().toLowerCase() === 'pin debit' ||
    (/\bpin\b/.test(hay) && /\bdebit\b/.test(hay) && !hay.includes('credit card'))
  );
}

export function isVoiceAuthLine(line: ScheduleARateLine): boolean {
  const hay = lineHaystack(line);
  return hay.includes('voice auth') || hay.includes('voice authorization');
}

export function isAnnualFeeLine(line: ScheduleARateLine): boolean {
  const hay = lineHaystack(line);
  const item = line.item.trim().toLowerCase();
  return (
    item.includes('annual fee') ||
    item.includes('1099k') ||
    (hay.includes('annual') && !hay.includes('/mo') && !hay.includes('monthly'))
  );
}

function applyLineMetadataCorrections(line: ScheduleARateLine): ScheduleARateLine {
  const next = { ...line };
  if (isPinDebitLine(next)) {
    next.feeAppliedOn = ['debit_card'];
    if (!next.feeOccurrence) next.feeOccurrence = 'per_transaction';
  }
  if (isVoiceAuthLine(next)) {
    next.feeOccurrence = 'per_call';
  }
  if (isAnnualFeeLine(next)) {
    next.feeOccurrence = 'per_year';
  }
  return next;
}

export function enrichScheduleALine(line: ScheduleARateLine): ScheduleARateLine {
  const migrated = migrateScheduleALine(line);
  const inferred = inferScheduleLineMetadata(migrated);
  return applyLineMetadataCorrections({
    ...migrated,
    feeOccurrence: migrated.feeOccurrence ?? inferred.feeOccurrence,
    feeAppliedOn: migrated.feeAppliedOn?.length ? migrated.feeAppliedOn : inferred.feeAppliedOn,
    tierApplied: migrated.tierApplied?.length ? migrated.tierApplied : inferred.tierApplied,
  });
}

export function enrichScheduleALines(lines: ScheduleARateLine[]): ScheduleARateLine[] {
  return lines.map(enrichScheduleALine);
}

export function parseScheduleLineMetadataFromRow(row: Record<string, unknown>): Partial<ScheduleARateLine> {
  const feeOccurrence =
    parseFeeOccurrence(row.feeOccurrence) ??
    parseFeeOccurrence(row.fee_occurrence) ??
    parseFeeOccurrence(row.occurrence);
  const feeAppliedOn =
    parseFeeAppliedOnList(row.feeAppliedOn) ??
    parseFeeAppliedOnList(row.fee_applied_on) ??
    parseFeeAppliedOnList(row.appliedOn);
  const tierApplied =
    parseTierAppliedList(row.tierApplied) ??
    parseTierAppliedList(row.tier_applied) ??
    parseTierAppliedList(row.tiers);
  return {
    ...(feeOccurrence ? { feeOccurrence } : {}),
    ...(feeAppliedOn ? { feeAppliedOn } : {}),
    ...(tierApplied ? { tierApplied } : {}),
  };
}

export function rateAmountFromLine(line: ScheduleARateLine): number {
  const parsed = parseScheduleRate(line.buyRate);
  if (!parsed) return 0;
  if (parsed.kind === 'monthly' || parsed.kind === 'annual' || parsed.kind === 'per_item') {
    return parsed.value;
  }
  if (parsed.kind === 'bps') return parsed.value;
  if (parsed.kind === 'percent') return parsed.value;
  return 0;
}
