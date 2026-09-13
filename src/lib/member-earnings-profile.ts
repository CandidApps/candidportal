/**
 * Member Earnings Profile (CR-0014)
 *
 * Source of truth for what a customer earns on a supplier.
 * Member UI: discount / rebate / cash back only — never “commission”.
 *
 * Self-agent payout (how this feeds commission):
 * - Members are paid as agents on themselves (`MEMBER-{customerId}` in bmw_agent_rates).
 * - Percent lines with duration Indefinitely or 1–24 months set the self-agent residual
 *   rate (same path as the old member_cashback_pct → ledger cashback_pct).
 * - Demo lines are display-only (not paid).
 * - Upfront/activation % and $ amounts are member-facing now; one-time ledger payout
 *   for those lines is a follow-up (residual % still records when present).
 * - AND: all lines apply (e.g. 5% residual AND $50 activation copy).
 * - OR: member-facing alternative copy; residual payout uses the largest indefinitely/
 *   months percent line if any.
 * Traditional partner agent residual rates (solution partnerRates) are unchanged.
 *
 * Migration mapping from member_cashback_pct:
 * - null / ≤ 0 → None (no profile)
 * - > 0 → one Rebate line, amountType percent, duration Indefinitely, combinator AND
 */

export const MEMBER_EARNINGS_KINDS = ['discount', 'rebate'] as const;
export type MemberEarningsKind = (typeof MEMBER_EARNINGS_KINDS)[number];

export const MEMBER_EARNINGS_AMOUNT_TYPES = ['percent', 'fixed'] as const;
export type MemberEarningsAmountType = (typeof MEMBER_EARNINGS_AMOUNT_TYPES)[number];

export const MEMBER_EARNINGS_COMBINATORS = ['and', 'or'] as const;
export type MemberEarningsCombinator = (typeof MEMBER_EARNINGS_COMBINATORS)[number];

export type MemberEarningsDuration =
  | { type: 'demo' }
  | { type: 'upfront' }
  | { type: 'indefinitely' }
  | { type: 'months'; months: number };

export type MemberEarningsLine = {
  id: string;
  kind: MemberEarningsKind;
  amount: number;
  amountType: MemberEarningsAmountType;
  duration: MemberEarningsDuration;
};

export type MemberEarningsProfile = {
  combinator: MemberEarningsCombinator;
  lines: MemberEarningsLine[];
};

export function emptyMemberEarningsProfile(): MemberEarningsProfile {
  return { combinator: 'and', lines: [] };
}

export function newMemberEarningsLine(kind: MemberEarningsKind): MemberEarningsLine {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    kind,
    amount: 0,
    amountType: 'percent',
    duration: { type: 'indefinitely' },
  };
}

function isKind(v: unknown): v is MemberEarningsKind {
  return v === 'discount' || v === 'rebate';
}

function isAmountType(v: unknown): v is MemberEarningsAmountType {
  return v === 'percent' || v === 'fixed';
}

function isCombinator(v: unknown): v is MemberEarningsCombinator {
  return v === 'and' || v === 'or';
}

function parseDuration(raw: unknown): MemberEarningsDuration | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const type = d.type;
  if (type === 'demo' || type === 'upfront' || type === 'indefinitely') return { type };
  if (type === 'months') {
    const months = Number(d.months);
    if (!Number.isInteger(months) || months < 1 || months > 24) return null;
    return { type: 'months', months };
  }
  return null;
}

function parseLine(raw: unknown, index: number): MemberEarningsLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const kind = row.kind;
  const amountType = row.amountType ?? row.amount_type;
  const amount = Number(row.amount);
  const duration = parseDuration(row.duration);
  if (!isKind(kind) || !isAmountType(amountType) || !duration) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `line-${index + 1}`;
  return {
    id,
    kind,
    amount: Math.round(amount * 100) / 100,
    amountType,
    duration,
  };
}

export function parseMemberEarningsProfile(raw: unknown): MemberEarningsProfile {
  if (!raw || typeof raw !== 'object') return emptyMemberEarningsProfile();
  const row = raw as Record<string, unknown>;
  const combinator = isCombinator(row.combinator) ? row.combinator : 'and';
  const linesIn = Array.isArray(row.lines) ? row.lines : [];
  const lines = linesIn
    .map((line, i) => parseLine(line, i))
    .filter((line): line is MemberEarningsLine => line != null);
  return { combinator, lines };
}

export function profileFromLegacyCashbackPct(pct: number | null | undefined): MemberEarningsProfile {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return emptyMemberEarningsProfile();
  return {
    combinator: 'and',
    lines: [
      {
        id: 'migrated-cashback',
        kind: 'rebate',
        amount: Math.round(pct * 100) / 100,
        amountType: 'percent',
        duration: { type: 'indefinitely' },
      },
    ],
  };
}

export function resolveMemberEarningsProfile(
  profileRaw: unknown,
  legacyPct: number | null | undefined,
): MemberEarningsProfile {
  const parsed = parseMemberEarningsProfile(profileRaw);
  if (parsed.lines.length > 0) return parsed;
  return profileFromLegacyCashbackPct(legacyPct);
}

export function isMemberEarningsNone(profile: MemberEarningsProfile | null | undefined): boolean {
  return !profile || profile.lines.length === 0;
}

/** Highest percent line — used for Find Solutions sort and member_cashback_pct compat. */
export function derivedMemberCashbackPct(profile: MemberEarningsProfile | null | undefined): number | null {
  if (!profile) return null;
  let max: number | null = null;
  for (const line of profile.lines) {
    if (line.amountType !== 'percent') continue;
    if (max == null || line.amount > max) max = line.amount;
  }
  return max;
}

function isResidualDuration(duration: MemberEarningsDuration): boolean {
  return duration.type === 'indefinitely' || duration.type === 'months';
}

/** Percent residual used for self-agent commission / cashback ledger. */
export function selfAgentResidualPct(profile: MemberEarningsProfile | null | undefined): number | null {
  if (!profile) return null;
  let max: number | null = null;
  for (const line of profile.lines) {
    if (line.amountType !== 'percent') continue;
    if (!isResidualDuration(line.duration)) continue;
    if (max == null || line.amount > max) max = line.amount;
  }
  return max;
}

function formatNum(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function formatAmount(line: MemberEarningsLine): string {
  if (line.amountType === 'percent') return `${formatNum(line.amount)}%`;
  return `$${formatNum(line.amount)}`;
}

function formatDurationTail(line: MemberEarningsLine): string {
  const d = line.duration;
  if (d.type === 'demo') return 'during demo';
  if (d.type === 'upfront') return 'on activation';
  if (d.type === 'indefinitely') return 'indefinitely';
  return d.months === 1 ? 'for 1 month' : `for ${d.months} months`;
}

function formatLinePhrase(
  line: MemberEarningsLine,
  opts?: { orRecurring?: boolean },
): string {
  const amt = formatAmount(line);
  if (line.amountType === 'percent' && line.duration.type === 'upfront') {
    return `${amt} on sale/activation`;
  }
  if (line.amountType === 'fixed' && line.duration.type === 'upfront') {
    return `${amt} on activation`;
  }
  if (line.amountType === 'percent' && line.duration.type === 'indefinitely') {
    if (opts?.orRecurring) return `${amt} recurring indefinitely`;
    return `${amt} cash back indefinitely`;
  }
  if (line.amountType === 'percent') {
    return `${amt} cash back ${formatDurationTail(line)}`;
  }
  if (line.kind === 'discount') {
    return `${amt} discount ${formatDurationTail(line)}`;
  }
  return `${amt} cash back ${formatDurationTail(line)}`;
}

/** Member-facing sentence. Never includes “commission”. */
export function formatMemberEarningsSentence(profile: MemberEarningsProfile | null | undefined): string | null {
  if (!profile || profile.lines.length === 0) return null;
  const joiner = profile.combinator === 'or' ? ' OR ' : ' AND ';
  const parts = profile.lines.map((line, i) =>
    formatLinePhrase(line, {
      orRecurring: profile.combinator === 'or' && i > 0 && line.duration.type === 'indefinitely',
    }),
  );
  if (parts.length === 1) return `Earn ${parts[0]}.`;
  const first =
    profile.combinator === 'and' && profile.lines[0]?.amountType === 'percent'
      ? `up to ${parts[0]}`
      : parts[0];
  return `Earn ${[first, ...parts.slice(1)].join(joiner)}.`;
}

export function formatMemberEarningsBadge(profile: MemberEarningsProfile | null | undefined): string | null {
  if (!profile || profile.lines.length === 0) return null;
  if (profile.lines.length === 1) {
    const line = profile.lines[0];
    if (line.amountType === 'percent') return `${formatNum(line.amount)}% cash back`;
    return `${formatAmount(line)} cash back`;
  }
  const bits = profile.lines.map((line) => formatAmount(line));
  return bits.join(profile.combinator === 'or' ? ' or ' : ' + ');
}

export const MEMBER_EARNINGS_DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: 'demo', label: 'Demo' },
  { value: 'upfront', label: 'Upfront / activation' },
  ...Array.from({ length: 24 }, (_, i) => {
    const months = i + 1;
    return {
      value: `months:${months}`,
      label: months === 1 ? '1 month' : `${months} months`,
    };
  }),
  { value: 'indefinitely', label: 'Indefinitely' },
];

export function durationToSelectValue(duration: MemberEarningsDuration): string {
  if (duration.type === 'months') return `months:${duration.months}`;
  return duration.type;
}

export function durationFromSelectValue(value: string): MemberEarningsDuration {
  if (value === 'demo' || value === 'upfront' || value === 'indefinitely') return { type: value };
  if (value.startsWith('months:')) {
    const months = Number(value.slice(7));
    if (Number.isInteger(months) && months >= 1 && months <= 24) return { type: 'months', months };
  }
  return { type: 'indefinitely' };
}

export function persistMemberEarningsProfile(
  profile: MemberEarningsProfile | null | undefined,
): MemberEarningsProfile | null {
  const parsed = parseMemberEarningsProfile(profile);
  if (parsed.lines.length === 0) return null;
  return parsed;
}
