/**
 * Earnings waterfall (docs/CandidIQ-MEMBER-EARNINGS-SPIFF-ARCHITECTURE.md → Waterfall,
 * Cash-back floors and deal override). Pure — no I/O. All values are percent points of MRC
 * unless named `*SharePct` (percent of Candid net).
 */
import { MEMBER_TIER_SHARE, type MemberTier } from '@/lib/incentive-campaigns';
import {
  candidNetForPaySource,
  paySourceToPartnerKey,
  type ProviderRatePartnerKey,
} from '@/lib/provider-rate-nets';

export type { MemberTier };

export type EarningsMode = 'split' | 'customer_only' | 'agent_only';

export const EARNINGS_MODES: EarningsMode[] = ['split', 'customer_only', 'agent_only'];

export const EARNINGS_MODE_LABEL: Record<EarningsMode, string> = {
  split: 'Split (customer + agent)',
  customer_only: 'Customer only',
  agent_only: 'Agent only',
};

/** Customer share of Candid net by member tier (percent of net). */
export const TIER_CUSTOMER_SHARE_PCT: Record<MemberTier, number> = {
  basic: MEMBER_TIER_SHARE.basic * 100,
  paid: MEMBER_TIER_SHARE.paid * 100,
};

/** Default selling-agent share of Candid net (percent of net). */
export const DEFAULT_AGENT_SHARE_PCT = 10;

/** Below this Candid net, no customer cash back is offered. */
export const CASH_BACK_MIN_NET_PCT = 5;
/** At or above this Candid net, the default is a customer + agent split. */
export const SPLIT_MIN_NET_PCT = 10;
/** Computed customer cash back is never offered below this after rounding. */
export const MIN_CASH_BACK_PCT = 1;

const EPS = 1e-9;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Floor to the nearest 0.5 percentage point (Candid keeps the remainder). */
export function floorToHalfPct(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.floor(pct * 2 + EPS) / 2;
}

export function isEarningsMode(v: unknown): v is EarningsMode {
  return typeof v === 'string' && (EARNINGS_MODES as string[]).includes(v);
}

/**
 * Default mode from the floors table. `agentRegistered` = a selling agent registered the deal
 * (not the member's own self-agent record).
 */
export function defaultEarningsMode(opts: {
  candidNetPct: number;
  hasAgent: boolean;
  agentRegistered?: boolean;
}): EarningsMode {
  const { candidNetPct, hasAgent } = opts;
  const agentRegistered = opts.agentRegistered ?? hasAgent;
  if (!hasAgent) return 'customer_only';
  if (candidNetPct >= SPLIT_MIN_NET_PCT) return 'split';
  if (candidNetPct < CASH_BACK_MIN_NET_PCT) return 'agent_only';
  return agentRegistered ? 'agent_only' : 'customer_only';
}

export type EarningsInput = {
  /** Candid net % of MRC from the locked pay source (or preview max). */
  candidNetPct: number;
  memberTier: MemberTier;
  /** Deal-level customer share of net (wins over everything). */
  dealCustomerSharePct?: number | null;
  /** Customer profile override of their share of net. */
  customerSharePct?: number | null;
  /** Selected customer-agent's customer cash-back split. */
  customerAgentSharePct?: number | null;
  hasAgent: boolean;
  agentRegistered?: boolean;
  /** Deal-level agent share of net (wins over agent profile). */
  dealAgentSharePct?: number | null;
  /** Agent profile share of net (default 10). */
  agentSharePct?: number | null;
  /** Explicit deal/quote mode; omitted = default from the floors table. */
  earningsMode?: EarningsMode | null;
};

export type EarningsResult = {
  candidNetPct: number;
  memberTier: MemberTier;
  customerSharePct: number;
  agentSharePct: number;
  earningsMode: EarningsMode;
  defaultEarningsMode: EarningsMode;
  modeOverridden: boolean;
  /** Before 0.5 floor. */
  rawCustomerPct: number;
  rawAgentPct: number;
  /** Member-facing cash back % of MRC (0 when not offered). */
  customerCashBackPct: number;
  /** Selling agent % of MRC. */
  agentPct: number;
  /** Agent rate expressed as % of Candid's imported residual $ (how Agent Payments pay today). */
  agentRateOfCandidResidualPct: number;
  candidRemainderPct: number;
  /** Admin-facing reasons the result differs from the plain waterfall. */
  notes: string[];
};

function pickShare(...values: (number | null | undefined)[]): number | null {
  for (const v of values) {
    if (v != null && Number.isFinite(v) && v >= 0) return v;
  }
  return null;
}

export function computeEarnings(input: EarningsInput): EarningsResult {
  const candidNetPct = Number.isFinite(input.candidNetPct) && input.candidNetPct > 0 ? input.candidNetPct : 0;
  const notes: string[] = [];

  const customerSharePct =
    pickShare(input.dealCustomerSharePct, input.customerSharePct, input.customerAgentSharePct) ??
    TIER_CUSTOMER_SHARE_PCT[input.memberTier];
  const agentSharePct = input.hasAgent
    ? pickShare(input.dealAgentSharePct, input.agentSharePct) ?? DEFAULT_AGENT_SHARE_PCT
    : 0;

  const defaultMode = defaultEarningsMode({
    candidNetPct,
    hasAgent: input.hasAgent,
    agentRegistered: input.agentRegistered,
  });
  let earningsMode = input.earningsMode && isEarningsMode(input.earningsMode) ? input.earningsMode : defaultMode;
  if (!input.hasAgent && earningsMode !== 'customer_only') {
    notes.push('No agent on the deal — customer only.');
    earningsMode = 'customer_only';
  }

  const customerEligible = earningsMode !== 'agent_only';
  const agentEligible = input.hasAgent && earningsMode !== 'customer_only';

  const rawCustomerPct = customerEligible ? round4((customerSharePct / 100) * candidNetPct) : 0;
  const rawAgentPct = agentEligible ? round4((agentSharePct / 100) * candidNetPct) : 0;

  let customerCashBackPct = floorToHalfPct(rawCustomerPct);
  if (customerEligible && candidNetPct < CASH_BACK_MIN_NET_PCT) {
    if (customerCashBackPct > 0) notes.push(`Candid net under ${CASH_BACK_MIN_NET_PCT}% — no cash back.`);
    customerCashBackPct = 0;
  } else if (customerEligible && customerCashBackPct > 0 && customerCashBackPct < MIN_CASH_BACK_PCT) {
    notes.push(`Cash back under ${MIN_CASH_BACK_PCT}% after rounding — not offered.`);
    customerCashBackPct = 0;
  }
  const agentPct = floorToHalfPct(rawAgentPct);

  const candidRemainderPct = round4(Math.max(0, candidNetPct - customerCashBackPct - agentPct));
  const agentRateOfCandidResidualPct =
    candidNetPct > 0 ? round4((agentPct / candidNetPct) * 100) : 0;

  return {
    candidNetPct: round4(candidNetPct),
    memberTier: input.memberTier,
    customerSharePct,
    agentSharePct,
    earningsMode,
    defaultEarningsMode: defaultMode,
    modeOverridden: earningsMode !== defaultMode,
    rawCustomerPct,
    rawAgentPct,
    customerCashBackPct,
    agentPct,
    agentRateOfCandidResidualPct,
    candidRemainderPct,
    notes,
  };
}

/* ── Preview (pay source unknown) ─────────────────────────────────────────── */

type PreviewProduct = Parameters<typeof candidNetForPaySource>[0]['product'];

/** Max supported partner net for a product (column O basis). */
export function previewCandidNetPct(
  product: PreviewProduct,
  shareByKey: Record<ProviderRatePartnerKey, number>,
): number | null {
  return candidNetForPaySource({ product, paySource: null, shareByKey });
}

/** Member-facing preview cash back % for a Find Solutions card/line (no agent, self-signup). */
export function previewCashBackPct(candidNetPct: number | null | undefined, memberTier: MemberTier): number {
  if (candidNetPct == null || !Number.isFinite(candidNetPct)) return 0;
  return computeEarnings({ candidNetPct, memberTier, hasAgent: false }).customerCashBackPct;
}

/** Highest preview cash back across product lines ("Up to X% Cash Back"). */
export function previewMaxCashBackPct(
  candidNetPcts: (number | null | undefined)[],
  memberTier: MemberTier,
): number {
  return candidNetPcts.reduce<number>((max, net) => Math.max(max, previewCashBackPct(net, memberTier)), 0);
}

/* ── Deal / quote snapshot ────────────────────────────────────────────────── */

export type EarningsSnapshot = {
  version: 1;
  lockedAt: string;
  paySource: string | null;
  paySourcePartner: ProviderRatePartnerKey | null;
  candidNetPct: number;
  memberTier: MemberTier;
  customerSharePct: number;
  agentSharePct: number;
  earningsMode: EarningsMode;
  modeOverridden: boolean;
  customerCashBackPct: number;
  agentPct: number;
  agentRateOfCandidResidualPct: number;
  candidRemainderPct: number;
};

export function buildEarningsSnapshot(
  input: EarningsInput & { paySource?: string | null; lockedAt?: string },
): EarningsSnapshot {
  const r = computeEarnings(input);
  const paySource = input.paySource?.trim() || null;
  return {
    version: 1,
    lockedAt: input.lockedAt ?? new Date().toISOString(),
    paySource,
    paySourcePartner: paySourceToPartnerKey(paySource),
    candidNetPct: r.candidNetPct,
    memberTier: r.memberTier,
    customerSharePct: r.customerSharePct,
    agentSharePct: r.agentSharePct,
    earningsMode: r.earningsMode,
    modeOverridden: r.modeOverridden,
    customerCashBackPct: r.customerCashBackPct,
    agentPct: r.agentPct,
    agentRateOfCandidResidualPct: r.agentRateOfCandidResidualPct,
    candidRemainderPct: r.candidRemainderPct,
  };
}

/** True when the snapshot's inputs still match — reuse it instead of re-locking. */
export function snapshotMatches(
  snap: EarningsSnapshot | null | undefined,
  input: Pick<EarningsInput, 'candidNetPct' | 'memberTier' | 'hasAgent' | 'earningsMode'> & {
    paySource?: string | null;
  },
): boolean {
  if (!snap || snap.version !== 1) return false;
  const mode = input.earningsMode ?? null;
  return (
    Math.abs(snap.candidNetPct - round4(input.candidNetPct)) < EPS &&
    snap.memberTier === input.memberTier &&
    (snap.paySource ?? null) === (input.paySource?.trim() || null) &&
    (snap.agentSharePct > 0) === input.hasAgent &&
    (mode == null ? !snap.modeOverridden : snap.earningsMode === mode)
  );
}

/** Member self-agent records (`MEMBER-*`) are the customer, not a selling agent. */
export function isSellingAgentId(agentCommId: string | null | undefined): boolean {
  const id = (agentCommId ?? '').trim();
  return Boolean(id) && !/^MEMBER-/i.test(id);
}
