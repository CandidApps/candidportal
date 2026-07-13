'use client';

import type { AgentStatus } from '@/components/AgentsView';
import { getAgentProfileOverride } from '@/lib/agents/agent-assignments';
import { resolveAgentMergeKey, resolveAgentDisplayName } from '@/lib/bmw/deal-master';

/** House account label when an external agent is inactive for a period. */
export const CANDID_SOLUTIONS_AGENT_LABEL = 'Candid Solutions';

/** Commission period (YYYY-MM) for an ISO date string. */
export function commissionPeriodFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** True when the agent should receive payout for this commission period. */
export function isAgentPayableForPeriod(agentCommId: string, period: string): boolean {
  if (!agentCommId.trim()) return false;
  const mergeKey = resolveAgentMergeKey(agentCommId);
  const profile = getAgentProfileOverride(mergeKey);
  if (!profile || profile.status !== 'inactive') return true;
  const effective = profile.inactiveEffectiveDate?.trim();
  if (!effective) return true;
  return period < commissionPeriodFromDate(effective);
}

export function displayAgentForCommission(agentCommId: string, period: string): string {
  if (!agentCommId.trim()) return CANDID_SOLUTIONS_AGENT_LABEL;
  if (!isAgentPayableForPeriod(agentCommId, period)) return CANDID_SOLUTIONS_AGENT_LABEL;
  return resolveAgentDisplayName(agentCommId);
}

export function agentRateForCommissionPeriod(
  agentCommId: string,
  period: string,
  ratePct: number,
): number | null {
  if (!isAgentPayableForPeriod(agentCommId, period)) return null;
  return ratePct;
}

export function computeAgentPayout(
  supplierAmount: number,
  agentCommId: string,
  period: string,
  ratePct: number,
): number {
  if (!isAgentPayableForPeriod(agentCommId, period)) return 0;
  return Math.round(supplierAmount * (ratePct / 100) * 100) / 100;
}

export function formatInactiveEffectiveLabel(isoDate: string | null | undefined): string | null {
  if (!isoDate?.trim()) return null;
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function validateAgentLifecyclePatch(patch: {
  status?: AgentStatus;
  inactiveEffectiveDate?: string | null;
}): string | null {
  if (patch.status === 'inactive' && !patch.inactiveEffectiveDate?.trim()) {
    return 'Choose an effective date when marking an agent inactive.';
  }
  if (patch.inactiveEffectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.inactiveEffectiveDate.trim())) {
    return 'Effective date must be YYYY-MM-DD.';
  }
  return null;
}
