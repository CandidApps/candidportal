'use client';

import type { Agent } from '@/components/AgentsView';
import { getAgentProfileOverride } from '@/lib/agents/agent-assignments';
import {
  getAgentRateProfile,
  getBmwAgentRates,
  resolveAgentMergeKey,
} from '@/lib/bmw/deal-master';
import type { BmwAgentRate } from '@/lib/bmw/types';
import { commissionPeriodFromDate, isAgentPayableForPeriod } from '@/lib/agents/agent-lifecycle';

export type AgentOverridePartnerInfo = {
  name: string;
  overrideCommId: string;
  mergeKey: string;
  overrideRate: number | null;
  tierLabel: string;
};

function normalizeAgentName(name: string): string {
  return name.trim().replace(/^\* /, '').toLowerCase();
}

/** Match override partner label from BMW to an agentCommId. */
export function resolveOverridePartnerCommId(
  partnerName: string,
  rates: BmwAgentRate[] = getBmwAgentRates(),
): string | null {
  const target = normalizeAgentName(partnerName);
  if (!target) return null;

  for (const rate of rates) {
    if (normalizeAgentName(rate.name) === target) return rate.id;
    if (rate.email?.trim().toLowerCase() === target) return rate.id;
  }
  return null;
}

export function listOverridePartnersForAgent(
  agent: Agent,
  rates: BmwAgentRate[] = getBmwAgentRates(),
): AgentOverridePartnerInfo[] {
  const seen = new Set<string>();
  const out: AgentOverridePartnerInfo[] = [];

  for (const tier of agent.tiers) {
    const name = tier.overridePartner?.trim();
    if (!name) continue;

    const overrideCommId = resolveOverridePartnerCommId(name, rates);
    if (!overrideCommId) continue;

    const mergeKey = resolveAgentMergeKey(overrideCommId);
    if (seen.has(mergeKey)) continue;
    seen.add(mergeKey);

    out.push({
      name,
      overrideCommId,
      mergeKey,
      overrideRate: tier.overrideRate,
      tierLabel: tier.label,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function agentHasOverridePartners(agent: Agent): boolean {
  return listOverridePartnersForAgent(agent).length > 0;
}

/** When inactive, should override partners on this agent's tiers continue receiving payout? */
export function keepOverridePartnersForAgent(agentCommId: string): boolean {
  const mergeKey = resolveAgentMergeKey(agentCommId);
  const profile = getAgentProfileOverride(mergeKey);
  if (profile?.status !== 'inactive') return false;
  return profile.keepOverridePartners !== false;
}

export function isPrimaryAgentInactiveForPeriod(agentCommId: string, period: string): boolean {
  return !isAgentPayableForPeriod(agentCommId, period);
}

export function overridePayoutForInactivePrimary(
  supplierAmount: number,
  primaryAgentCommId: string,
  period: string,
  overrideRatePct: number,
): number {
  if (!keepOverridePartnersForAgent(primaryAgentCommId)) return 0;
  if (!isPrimaryAgentInactiveForPeriod(primaryAgentCommId, period)) return 0;
  if (!Number.isFinite(overrideRatePct) || overrideRatePct <= 0) return 0;
  return Math.round(supplierAmount * (overrideRatePct / 100) * 100) / 100;
}

export type OverridePayoutLine = {
  overrideCommId: string;
  overrideRate: number;
  overridePayout: number;
};

/** Resolve override payout lines for a deal assigned to primaryAgentCommId. */
export function overridePayoutLinesForDeal(
  supplierAmount: number,
  primaryAgentCommId: string,
  period: string,
): OverridePayoutLine[] {
  if (!isPrimaryAgentInactiveForPeriod(primaryAgentCommId, period)) return [];
  if (!keepOverridePartnersForAgent(primaryAgentCommId)) return [];

  const profile = getAgentRateProfile(primaryAgentCommId);
  const partnerName = profile?.overridePartner?.trim();
  const overrideRate = profile?.overrideRate;
  if (!partnerName || overrideRate == null || overrideRate <= 0) return [];

  const overrideCommId = resolveOverridePartnerCommId(partnerName);
  if (!overrideCommId || !isAgentPayableForPeriod(overrideCommId, period)) return [];

  const overridePayout = overridePayoutForInactivePrimary(
    supplierAmount,
    primaryAgentCommId,
    period,
    overrideRate,
  );
  if (overridePayout <= 0) return [];

  return [{ overrideCommId, overrideRate, overridePayout }];
}

export function formatKeepOverrideSummary(partners: AgentOverridePartnerInfo[]): string {
  if (!partners.length) return '';
  return partners
    .map((p) => (p.overrideRate != null ? `${p.name} (${p.overrideRate}%)` : p.name))
    .join(', ');
}

export function inactiveEffectivePeriodLabel(isoDate: string | null | undefined): string | null {
  if (!isoDate?.trim()) return null;
  return commissionPeriodFromDate(isoDate);
}
