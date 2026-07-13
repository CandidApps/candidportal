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

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
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

/** When primary is inactive, should override partners on this agent's tiers continue receiving payout? */
export function keepOverridePartnersForAgent(agentCommId: string): boolean {
  const mergeKey = resolveAgentMergeKey(agentCommId);
  const profile = getAgentProfileOverride(mergeKey);
  if (profile?.status !== 'inactive') return false;
  return profile.keepOverridePartners !== false;
}

export function isPrimaryAgentInactiveForPeriod(agentCommId: string, period: string): boolean {
  return !isAgentPayableForPeriod(agentCommId, period);
}

export type OverridePayoutLine = {
  overrideCommId: string;
  overrideRate: number;
  overridePayout: number;
};

/**
 * Override partners receive their override % in addition to the primary agent's tier %.
 * When the primary agent is inactive, overrides pay only if "keep override partners"
 * was chosen (e.g. Day Schneck on Dennis Wren).
 */
export function overridePayoutLinesForDeal(
  supplierAmount: number,
  primaryAgentCommId: string,
  period: string,
): OverridePayoutLine[] {
  const profile = getAgentRateProfile(primaryAgentCommId);
  const partnerName = profile?.overridePartner?.trim();
  const overrideRate = profile?.overrideRate;
  if (!partnerName || overrideRate == null || overrideRate <= 0) return [];

  const overrideCommId = resolveOverridePartnerCommId(partnerName);
  if (!overrideCommId) return [];

  const primaryInactive = !isAgentPayableForPeriod(primaryAgentCommId, period);
  const overrideActive = isAgentPayableForPeriod(overrideCommId, period);

  if (primaryInactive) {
    if (!keepOverridePartnersForAgent(primaryAgentCommId)) return [];
    if (!overrideActive) return [];
  } else if (!overrideActive) {
    return [];
  }

  const overridePayout = roundMoney(supplierAmount * (overrideRate / 100));
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
