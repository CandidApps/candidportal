export type ScheduleARateLine = {
  id: string;
  section: string;
  item: string;
  buyRate: string;
  revenueShare?: string;
  notes?: string;
};

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

const SECTION_ALIASES: Record<string, ScheduleASection> = {
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
};

export function normalizeScheduleASection(section?: string | null): string {
  const trimmed = section?.trim();
  if (!trimmed) return 'General';
  if ((SCHEDULE_A_SECTIONS as readonly string[]).includes(trimmed)) return trimmed;
  const alias = SECTION_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  return trimmed;
}

export function scheduleASectionOptions(lines: ScheduleARateLine[]): string[] {
  const extras = new Set<string>();
  for (const line of lines) {
    const normalized = normalizeScheduleASection(line.section);
    if (!(SCHEDULE_A_SECTIONS as readonly string[]).includes(normalized)) {
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
    const bucket = buckets.get(section);
    if (bucket?.length) ordered.push({ section, lines: bucket });
  }

  for (const [section, bucket] of buckets) {
    if (!sectionOrder.includes(section) && bucket.length) {
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
  };
}
