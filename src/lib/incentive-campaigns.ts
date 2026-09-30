/** Supplier SPIFFs and Candid promos share one campaign model; `source` is the only difference. */

import type { MemberPromo } from '@/lib/member-promos';

export type CampaignSource = 'supplier_spiff' | 'candid_promo';
export type CampaignStructureType = 'percent' | 'dollar' | 'multiplier';
export type CampaignCustomerFacing = 'yes' | 'review' | 'no';
export type CampaignStatus = 'active' | 'scheduled' | 'ended' | 'review';

export type IncentiveCampaign = {
  id: string;
  providerDbId: number;
  source: CampaignSource;
  title: string;
  details?: string;
  structureType?: CampaignStructureType;
  structureValue?: number;
  /** YYYY-MM-DD */
  startsOn?: string;
  /** YYYY-MM-DD */
  endsOn?: string;
  endedEarlyAt?: string;
  customerFacing: CampaignCustomerFacing;
  ctaLabel?: string;
  bannerImagePath?: string;
  bannerImageUrl?: string;
  showInSlider: boolean;
  slideOrder: number;
  /** Customer-facing qualifying conditions. */
  criteria?: string;
  /** Admin-only fields captured by the SPIFF import (CR-0035). */
  internal?: CampaignInternalFields;
  createdAt: string;
  updatedAt: string;
};

export type CampaignInternalFields = {
  sourceProgram?: string;
  category?: string;
  name?: string;
  description?: string;
  terms?: string;
  adminNotes?: string;
  payoutRaw?: string;
  payoutUpTo?: boolean;
  minMonthlyCharge?: number;
  minTermMonths?: number;
  payoutTimeline?: string;
  externalLink?: string;
  importKey?: string;
  importedAt?: string;
};

export type DbIncentiveCampaign = {
  id: string;
  provider_id: number;
  source: string;
  title: string;
  details: string | null;
  structure_type: string | null;
  structure_value: number | string | null;
  starts_on: string | null;
  ends_on: string | null;
  ended_early_at: string | null;
  customer_facing: string;
  cta_label: string | null;
  banner_image_path: string | null;
  banner_image_url: string | null;
  show_in_slider: boolean;
  slide_order: number;
  criteria?: string | null;
  source_program?: string | null;
  category?: string | null;
  internal_name?: string | null;
  internal_description?: string | null;
  internal_terms?: string | null;
  admin_notes?: string | null;
  payout_raw?: string | null;
  payout_up_to?: boolean | null;
  min_monthly_charge?: number | string | null;
  min_term_months?: number | null;
  payout_timeline?: string | null;
  external_link?: string | null;
  import_key?: string | null;
  imported_at?: string | null;
  created_at: string;
  updated_at: string;
};

export const CAMPAIGN_SOURCE_LABEL: Record<CampaignSource, string> = {
  candid_promo: 'Candid promo',
  supplier_spiff: 'Supplier SPIFF',
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  ended: 'Ended',
  review: 'Needs review',
};

export const CAMPAIGN_TITLE_MAX = 120;
export const CAMPAIGN_DETAILS_MAX = 400;
export const CAMPAIGN_CTA_MAX = 40;
export const CAMPAIGN_CRITERIA_MAX = 600;
export const DEFAULT_CAMPAIGN_CTA = 'View offer';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateOrUndefined(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().slice(0, 10);
  return DATE_RE.test(v) ? v : undefined;
}

function textOrUndefined(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().slice(0, max);
  return v || undefined;
}

export function isCampaignSource(v: unknown): v is CampaignSource {
  return v === 'supplier_spiff' || v === 'candid_promo';
}

function structureTypeOrUndefined(v: unknown): CampaignStructureType | undefined {
  return v === 'percent' || v === 'dollar' || v === 'multiplier' ? v : undefined;
}

function customerFacingOr(v: unknown, fallback: CampaignCustomerFacing): CampaignCustomerFacing {
  return v === 'yes' || v === 'review' || v === 'no' ? v : fallback;
}

function mapInternal(row: DbIncentiveCampaign): CampaignInternalFields | undefined {
  const minCharge = row.min_monthly_charge == null ? undefined : Number(row.min_monthly_charge);
  const internal: CampaignInternalFields = {
    sourceProgram: row.source_program ?? undefined,
    category: row.category ?? undefined,
    name: row.internal_name ?? undefined,
    description: row.internal_description ?? undefined,
    terms: row.internal_terms ?? undefined,
    adminNotes: row.admin_notes ?? undefined,
    payoutRaw: row.payout_raw ?? undefined,
    payoutUpTo: row.payout_up_to ? true : undefined,
    minMonthlyCharge: minCharge != null && Number.isFinite(minCharge) ? minCharge : undefined,
    minTermMonths: row.min_term_months ?? undefined,
    payoutTimeline: row.payout_timeline ?? undefined,
    externalLink: row.external_link ?? undefined,
    importKey: row.import_key ?? undefined,
    importedAt: row.imported_at ?? undefined,
  };
  return Object.values(internal).some((v) => v != null) ? internal : undefined;
}

export function mapDbCampaign(row: DbIncentiveCampaign): IncentiveCampaign {
  const value = row.structure_value == null ? undefined : Number(row.structure_value);
  const internal = mapInternal(row);
  return {
    id: row.id,
    providerDbId: row.provider_id,
    source: isCampaignSource(row.source) ? row.source : 'candid_promo',
    title: row.title,
    details: row.details ?? undefined,
    structureType: structureTypeOrUndefined(row.structure_type),
    structureValue: value != null && Number.isFinite(value) ? value : undefined,
    startsOn: dateOrUndefined(row.starts_on),
    endsOn: dateOrUndefined(row.ends_on),
    endedEarlyAt: row.ended_early_at ?? undefined,
    customerFacing: customerFacingOr(row.customer_facing, 'review'),
    ctaLabel: row.cta_label ?? undefined,
    bannerImagePath: row.banner_image_path ?? undefined,
    bannerImageUrl: row.banner_image_url ?? undefined,
    showInSlider: Boolean(row.show_in_slider),
    slideOrder: Number(row.slide_order) || 0,
    ...(row.criteria ? { criteria: row.criteria } : {}),
    ...(internal ? { internal } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CampaignInput = {
  providerDbId?: number;
  source?: CampaignSource;
  title?: string;
  details?: string | null;
  structureType?: CampaignStructureType | null;
  structureValue?: number | null;
  startsOn?: string | null;
  endsOn?: string | null;
  customerFacing?: CampaignCustomerFacing;
  ctaLabel?: string | null;
  showInSlider?: boolean;
  slideOrder?: number;
  criteria?: string | null;
};

/** Validates editable fields and returns DB column values. Banner image is handled by its own route. */
export function campaignPersistFields(
  input: CampaignInput,
): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  const title = textOrUndefined(input.title, CAMPAIGN_TITLE_MAX);
  if (!title) return { ok: false, error: 'Headline is required.' };
  const startsOn = dateOrUndefined(input.startsOn ?? undefined);
  const endsOn = dateOrUndefined(input.endsOn ?? undefined);
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, error: 'End date must be on or after the start date.' };
  }
  const structureType = structureTypeOrUndefined(input.structureType);
  const rawValue = input.structureValue == null ? null : Number(input.structureValue);
  const structureValue =
    structureType && rawValue != null && Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : null;
  const slideOrder = Number(input.slideOrder);
  return {
    ok: true,
    fields: {
      title,
      details: textOrUndefined(input.details, CAMPAIGN_DETAILS_MAX) ?? null,
      structure_type: structureType ?? null,
      structure_value: structureValue,
      starts_on: startsOn ?? null,
      ends_on: endsOn ?? null,
      customer_facing: customerFacingOr(input.customerFacing, 'review'),
      cta_label: textOrUndefined(input.ctaLabel, CAMPAIGN_CTA_MAX) ?? null,
      show_in_slider: Boolean(input.showInSlider),
      slide_order: Number.isFinite(slideOrder) ? Math.max(0, Math.round(slideOrder)) : 0,
      ...(input.criteria !== undefined
        ? { criteria: textOrUndefined(input.criteria, CAMPAIGN_CRITERIA_MAX) ?? null }
        : {}),
    },
  };
}

export function todayIso(today = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function campaignStatus(c: IncentiveCampaign, today = todayIso()): CampaignStatus {
  if (c.endedEarlyAt || (c.endsOn && c.endsOn < today)) return 'ended';
  if (c.startsOn && c.startsOn > today) return 'scheduled';
  if (c.customerFacing !== 'yes') return 'review';
  return 'active';
}

/** Shown to members: customer-facing Yes, inside its date window, not ended early. */
export function isCampaignLive(c: IncentiveCampaign, today = todayIso()): boolean {
  return campaignStatus(c, today) === 'active';
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Admin structure label, e.g. "+0.5%", "$200", "1.5× MRC". Member payout math lives in the earnings engine. */
export function formatCampaignStructure(c: Pick<IncentiveCampaign, 'structureType' | 'structureValue'>): string | null {
  if (!c.structureType || c.structureValue == null) return null;
  const v = trimNumber(c.structureValue);
  switch (c.structureType) {
    case 'percent':
      return `+${v}%`;
    case 'dollar':
      return `$${v}`;
    case 'multiplier':
      return `${v}× MRC`;
  }
}

/** Member tier share of a supplier SPIFF (architecture doc: Basic 10% / Paid 20%). */
export const MEMBER_TIER_SHARE = { basic: 0.1, paid: 0.2 } as const;
export type MemberTier = keyof typeof MEMBER_TIER_SHARE;

/**
 * Member-facing reward line. Supplier SPIFF payouts are scaled by the member's tier share;
 * Candid promos are authored member-facing and shown as-is. Never mentions the share itself.
 */
export function formatMemberReward(
  c: Pick<IncentiveCampaign, 'source' | 'structureType' | 'structureValue' | 'internal'>,
  tier: MemberTier = 'paid',
): string | null {
  if (!c.structureType || c.structureValue == null) return null;
  const share = c.source === 'supplier_spiff' ? MEMBER_TIER_SHARE[tier] : 1;
  const upTo = c.internal?.payoutUpTo ? 'Up to ' : '';
  const v = c.structureValue * share;
  switch (c.structureType) {
    case 'multiplier':
      return `${upTo}${trimNumber(v)}X your monthly charge as one-time cash back`;
    case 'dollar':
      return `${upTo}$${trimNumber(v)} one-time cash back`;
    case 'percent':
      return c.source === 'supplier_spiff'
        ? `${upTo}${trimNumber(v)}% cash back`
        : `+${trimNumber(v)}% cash back`;
  }
}

/**
 * Tier-aware member view of a live campaign, labeled "Up to" when the supplier payout was stated
 * as a maximum. Callers pass the viewer's customers.member_tier; the Paid default is the maximum.
 */
export function campaignToMemberPromo(c: IncentiveCampaign, tier: MemberTier = 'paid'): MemberPromo {
  const reward = c.source === 'supplier_spiff' ? formatMemberReward(c, tier) : null;
  const details = [reward, c.details, c.criteria].filter(Boolean).join(' · ');
  return {
    id: c.id,
    title: c.title,
    ...(details ? { details } : {}),
    ...(c.endsOn ? { expiresOn: c.endsOn } : {}),
  };
}
