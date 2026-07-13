import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import type { UcaasQuoteLine, UcaasQuoteSnapshot } from '@/lib/ucaas/types';
import { computeUcaasQuote, round2 } from '@/lib/ucaas/quote-engine';
import type { QuoteSavingsPreview } from '@/lib/services/quote-savings';
import { proposalSavingsPair } from '@/lib/services/quote-savings';

/**
 * Frozen economics from the published analysis — used for original savings
 * and for projecting savings after seats are added post-switch.
 */
export type ServiceSavingsBaseline = {
  monthlySavings: number;
  annualSavings: number;
  /** Customer's old provider monthly total at analysis time. */
  oldMonthly: number;
  /** Seat/license count used as the old-provider baseline. */
  seatCount: number;
  /** Candid seat-line quantity at publish (usually same as seatCount). */
  candidSeatCount: number;
  /** Quote line item ids treated as scalable seats. */
  seatItemIds: string[];
  capturedAt: string;
};

const SEAT_NAME_RE = /\b(seat|extension|license|user|licence|agent)\b/i;

export function isSeatLikeLine(line: Pick<UcaasQuoteLine, 'section' | 'name' | 'flat' | 'quantity'>): boolean {
  if (line.section !== 'monthly' || line.flat) return false;
  if (SEAT_NAME_RE.test(line.name)) return true;
  return false;
}

/** Prefer named seat lines; else largest non-flat monthly quantity; else fee drivers. */
export function resolveSeatLines(quote: UcaasQuoteSnapshot): UcaasQuoteLine[] {
  const monthly = quote.lines.filter((l) => l.section === 'monthly' && !l.flat && l.quantity > 0);
  const named = monthly.filter((l) => isSeatLikeLine(l));
  if (named.length) return named;

  const driverIds = new Set(quote.fees.flatMap((f) => f.driverItemIds));
  const driven = monthly.filter((l) => driverIds.has(l.itemId));
  if (driven.length) return driven;

  if (!monthly.length) return [];
  const maxQty = Math.max(...monthly.map((l) => l.quantity));
  return monthly.filter((l) => l.quantity === maxQty);
}

export function seatQuantityFromQuote(quote: UcaasQuoteSnapshot): number {
  const seats = resolveSeatLines(quote);
  const sum = seats.reduce((s, l) => s + (l.quantity || 0), 0);
  return sum > 0 ? sum : 0;
}

export function buildSavingsBaselineFromSnapshot(
  snap: PublishedAnalysisSnapshot,
): ServiceSavingsBaseline | null {
  const pair = proposalSavingsPair(snap);
  if (!pair || pair.monthly <= 0) return null;

  let oldMonthly = 0;
  let seatCount = 0;
  let candidSeatCount = 0;
  let seatItemIds: string[] = [];

  if (snap.ucaasQuote) {
    oldMonthly = snap.ucaasQuote.currentMonthlySpend || 0;
    const seatLines = resolveSeatLines(snap.ucaasQuote);
    seatItemIds = seatLines.map((l) => l.itemId);
    candidSeatCount = seatLines.reduce((s, l) => s + (l.quantity || 0), 0);
    seatCount = candidSeatCount > 0 ? candidSeatCount : 0;
    // If we have old spend but no seat lines, treat as 1 "unit" so adds still scale.
    if (oldMonthly > 0 && seatCount <= 0) {
      seatCount = 1;
      candidSeatCount = 1;
    }
  }

  return {
    monthlySavings: round2(pair.monthly),
    annualSavings: round2(pair.annual),
    oldMonthly: round2(oldMonthly),
    seatCount,
    candidSeatCount,
    seatItemIds,
    capturedAt: snap.publishedAt || new Date().toISOString(),
  };
}

export function parseSavingsBaseline(raw: unknown): ServiceSavingsBaseline | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const monthlySavings = Number(o.monthlySavings);
  const annualSavings = Number(o.annualSavings);
  if (!Number.isFinite(monthlySavings) || monthlySavings <= 0) return null;
  return {
    monthlySavings,
    annualSavings: Number.isFinite(annualSavings) ? annualSavings : monthlySavings * 12,
    oldMonthly: Number(o.oldMonthly) || 0,
    seatCount: Math.max(0, Math.floor(Number(o.seatCount) || 0)),
    candidSeatCount: Math.max(0, Math.floor(Number(o.candidSeatCount) || 0)),
    seatItemIds: Array.isArray(o.seatItemIds) ? o.seatItemIds.map(String) : [],
    capturedAt: typeof o.capturedAt === 'string' ? o.capturedAt : new Date().toISOString(),
  };
}

export type ServiceSavingsDisplay = {
  /** Original proposed savings from the published analysis (frozen). */
  original: QuoteSavingsPreview;
  /**
   * Projected savings at current scale (baseline seats + added seats)
   * vs what the old provider would have charged. Only set when seats were added.
   */
  adjusted: QuoteSavingsPreview | null;
  addedSeatCount: number;
};

function bumpQuoteForAddedSeats(
  quote: UcaasQuoteSnapshot,
  baseline: ServiceSavingsBaseline,
  addedSeats: number,
): { lines: UcaasQuoteLine[]; oldMonthly: number } {
  const seatIds = baseline.seatItemIds.length
    ? baseline.seatItemIds
    : resolveSeatLines(quote).map((l) => l.itemId);

  const primaryId =
    seatIds
      .map((id) => quote.lines.find((l) => l.itemId === id))
      .filter((l): l is UcaasQuoteLine => Boolean(l))
      .sort((a, b) => b.quantity - a.quantity)[0]?.itemId ?? seatIds[0];

  let lines: UcaasQuoteLine[];
  if (primaryId) {
    lines = quote.lines.map((l) =>
      l.itemId === primaryId && !l.flat ? { ...l, quantity: l.quantity + addedSeats } : l,
    );
  } else {
    const target = quote.lines.find((l) => l.section === 'monthly' && !l.flat);
    lines = target
      ? quote.lines.map((l) =>
          l.itemId === target.itemId ? { ...l, quantity: l.quantity + addedSeats } : l,
        )
      : quote.lines;
  }

  return { lines, oldMonthly: scaleOldMonthly(baseline, addedSeats) };
}

function scaleOldMonthly(baseline: ServiceSavingsBaseline, addedSeats: number): number {
  const baseSeats = baseline.seatCount > 0 ? baseline.seatCount : 1;
  return round2(baseline.oldMonthly * ((baseSeats + addedSeats) / baseSeats));
}

/**
 * Compute original + optional adjusted savings for a managed service.
 * Adjusted only appears when addedSeatCount > 0 and we can project vs old provider.
 */
export function computeServiceSavingsDisplay(params: {
  snapshot?: PublishedAnalysisSnapshot | null;
  baseline?: ServiceSavingsBaseline | null;
  addedSeatCount?: number | null;
  categoryLabel?: string | null;
}): ServiceSavingsDisplay | null {
  const added = Math.max(0, Math.floor(params.addedSeatCount ?? 0));
  const baseline = params.baseline;
  const snap = params.snapshot;

  let original: QuoteSavingsPreview | null = null;
  if (baseline && baseline.monthlySavings > 0) {
    original = {
      monthly: baseline.monthlySavings,
      annual: baseline.annualSavings,
      generatedAt: baseline.capturedAt,
      categoryLabel: params.categoryLabel ?? null,
    };
  } else if (snap) {
    const pair = proposalSavingsPair(snap);
    if (pair && pair.monthly > 0) {
      original = {
        monthly: pair.monthly,
        annual: pair.annual,
        generatedAt: snap.publishedAt ?? null,
        categoryLabel: params.categoryLabel ?? snap.categoriesLabel ?? snap.categoryLabel ?? null,
      };
    }
  }

  if (!original) return null;

  let adjusted: QuoteSavingsPreview | null = null;
  if (added > 0 && snap?.ucaasQuote && baseline && baseline.oldMonthly > 0) {
    try {
      const { lines, oldMonthly } = bumpQuoteForAddedSeats(snap.ucaasQuote, baseline, added);
      const totals = computeUcaasQuote({
        lines,
        fees: snap.ucaasQuote.fees,
        setupTaxes: snap.ucaasQuote.setupTaxes,
        monthlyTaxRatePct: snap.ucaasQuote.monthlyTaxRatePct,
        currentMonthlySpend: oldMonthly,
      });
      if (totals.monthlySavings > 0) {
        adjusted = {
          monthly: totals.monthlySavings,
          annual: totals.annualSavings,
          generatedAt: baseline.capturedAt,
          categoryLabel: original.categoryLabel,
        };
      }
    } catch {
      // fall through — original only
    }
  } else if (added > 0 && baseline && baseline.oldMonthly > 0 && baseline.seatCount > 0) {
    // Non-UCaaS fallback: scale both sides linearly from baseline.
    const factor = (baseline.seatCount + added) / baseline.seatCount;
    const projectedOld = baseline.oldMonthly * factor;
    const candidAtBaseline = baseline.oldMonthly - baseline.monthlySavings;
    const projectedCandid = candidAtBaseline * factor;
    const monthly = round2(projectedOld - projectedCandid);
    if (monthly > 0) {
      adjusted = {
        monthly,
        annual: round2(monthly * 12),
        generatedAt: baseline.capturedAt,
        categoryLabel: original.categoryLabel,
      };
    }
  }

  return { original, adjusted, addedSeatCount: added };
}
