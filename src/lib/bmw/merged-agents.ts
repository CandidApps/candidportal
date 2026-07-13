import {
  getAgentProfileOverride,
  getCustomerTierOverride,
} from '@/lib/agents/agent-assignments';
import { effectiveCommissionRate } from '@/lib/bmw/agent-comm-history';
import {
  bmwCustomerIdForDeal,
  bmwCustomersByAgent,
  getBmwAgentRates,
  getBmwDeals,
  rebuildAgentRateIndex,
} from '@/lib/bmw/deal-master';
import type { BmwAgentRate } from '@/lib/bmw/types';
import type {
  Agent,
  AgentCommissionTier,
  AgentCustomerRef,
  AgentStatus,
} from '@/components/AgentsView';

export function agentMergeKeyFromProfile(profile: BmwAgentRate): string {
  const email = profile.email?.trim().toLowerCase();
  if (email) return email;
  const name = profile.name.trim().replace(/^\* /, '').toLowerCase();
  if (name) return name.replace(/\s+/g, ' ');
  return profile.id;
}

type BuildContext = {
  allCustomers: AgentCustomerRef[];
  nameById: Map<string, string>;
  customersByTier: Map<string, AgentCustomerRef[]>;
  dealsByCustomerId: Map<string, BmwDeal[]>;
  mergeKeyCounts: Map<string, number>;
};

type BmwDeal = ReturnType<typeof getBmwDeals>[number];

let cachedAgents: Agent[] | null = null;
let cacheKey = '';
let cachedAllCustomers: AgentCustomerRef[] = [];

export function invalidateMergedAgentsCache(): void {
  cachedAgents = null;
  cacheKey = '';
  cachedAllCustomers = [];
}

function currentCacheKey(): string {
  return `${getBmwDeals().length}:${getBmwAgentRates().length}`;
}

function agentStatusFromProfiles(profiles: BmwAgentRate[]): AgentStatus {
  if (profiles.some((p) => p.name.startsWith('*'))) return 'active';
  if (profiles.every((p) => p.commissionRate <= 0)) return 'inactive';
  return 'active';
}

function createBuildContext(): BuildContext {
  const allCustomers: AgentCustomerRef[] = [];
  const nameById = new Map<string, string>();
  for (const deal of getBmwDeals()) {
    if (!deal.merchant) continue;
    const id = bmwCustomerIdForDeal(deal);
    if (!id || nameById.has(id)) continue;
    const name = deal.merchant.trim();
    nameById.set(id, name);
    allCustomers.push({ id, name });
  }
  allCustomers.sort((a, b) => a.name.localeCompare(b.name));

  const dealsByCustomerId = new Map<string, BmwDeal[]>();
  for (const deal of getBmwDeals()) {
    if (!deal.merchant) continue;
    const id = bmwCustomerIdForDeal(deal);
    if (!id) continue;
    const list = dealsByCustomerId.get(id) ?? [];
    list.push(deal);
    dealsByCustomerId.set(id, list);
  }

  const mergeKeyCounts = new Map<string, number>();
  for (const profile of getBmwAgentRates()) {
    const key = agentMergeKeyFromProfile(profile);
    mergeKeyCounts.set(key, (mergeKeyCounts.get(key) ?? 0) + 1);
  }

  return {
    allCustomers,
    nameById,
    customersByTier: bmwCustomersByAgent(),
    dealsByCustomerId,
    mergeKeyCounts,
  };
}

function formatAgentTierLabel(profile: BmwAgentRate, ctx: BuildContext): string {
  const rate = effectiveCommissionRate(profile);
  const parts: string[] = [`${rate}%`];
  if (profile.overridePartner?.trim()) {
    parts.push(`override: ${profile.overridePartner.trim()}`);
    if (profile.overrideRate != null && Number.isFinite(profile.overrideRate)) {
      parts[parts.length - 1] += ` (${profile.overrideRate}%)`;
    }
  }
  const key = agentMergeKeyFromProfile(profile);
  if ((ctx.mergeKeyCounts.get(key) ?? 0) > 1) {
    parts.push(profile.id);
  }
  return parts.join(' · ');
}

function resolveCustomerTierForAgent(
  customerId: string,
  tierIds: Set<string>,
  ctx: BuildContext,
): string | null {
  const override = getCustomerTierOverride(customerId);
  if (override !== undefined) {
    if (!override) return null;
    return tierIds.has(override) ? override : null;
  }

  const deals = ctx.dealsByCustomerId.get(customerId) ?? [];
  const counts = new Map<string, number>();
  for (const deal of deals) {
    const id = deal.agentCommId?.trim();
    if (!id || !tierIds.has(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (!counts.size) return null;

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

function customersForMergedAgent(
  tierProfiles: BmwAgentRate[],
  ctx: BuildContext,
): AgentCustomerRef[] {
  const tierIds = new Set(tierProfiles.map((p) => p.id));
  const candidateIds = new Set<string>();

  for (const tierId of tierIds) {
    for (const c of ctx.customersByTier.get(tierId) ?? []) {
      candidateIds.add(c.id);
    }
  }

  for (const c of ctx.allCustomers) {
    if (resolveCustomerTierForAgent(c.id, tierIds, ctx)) {
      candidateIds.add(c.id);
    }
  }

  return [...candidateIds]
    .map((id) => ({ id, name: ctx.nameById.get(id) ?? id }))
    .filter((c) => resolveCustomerTierForAgent(c.id, tierIds, ctx) != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildMergedAgents(): Agent[] {
  const key = currentCacheKey();
  if (cachedAgents && cacheKey === key) {
    return cachedAgents;
  }

  rebuildAgentRateIndex();
  const ctx = createBuildContext();
  const rates = getBmwAgentRates();
  const groups = new Map<string, BmwAgentRate[]>();

  for (const profile of rates) {
    const mergeKey = agentMergeKeyFromProfile(profile);
    const list = groups.get(mergeKey) ?? [];
    list.push(profile);
    groups.set(mergeKey, list);
  }

  const result = [...groups.entries()]
    .map(([mergeKey, profiles]) => {
      const sortedProfiles = [...profiles].sort(
        (a, b) => effectiveCommissionRate(b) - effectiveCommissionRate(a),
      );
      const primary = sortedProfiles[0]!;
      const tierIds = new Set(sortedProfiles.map((p) => p.id));
      const override = getAgentProfileOverride(mergeKey);

      const tiers: AgentCommissionTier[] = sortedProfiles.map((profile) => {
        const tierCustomerIds = new Set<string>();

        for (const c of ctx.customersByTier.get(profile.id) ?? []) {
          tierCustomerIds.add(c.id);
        }

        for (const c of ctx.allCustomers) {
          if (resolveCustomerTierForAgent(c.id, tierIds, ctx) === profile.id) {
            tierCustomerIds.add(c.id);
          }
        }

        const customers = [...tierCustomerIds]
          .map((id) => ({ id, name: ctx.nameById.get(id) ?? id }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return {
          id: profile.id,
          label: formatAgentTierLabel(profile, ctx),
          commissionRate: effectiveCommissionRate(profile),
          baseCommissionRate: profile.commissionRate,
          overridePartner: profile.overridePartner?.trim() || undefined,
          overrideRate: profile.overrideRate,
          tempRate: profile.tempRate,
          tempRateEndDate: profile.tempRateEndDate?.trim() || undefined,
          customers,
        };
      });

      const customers = customersForMergedAgent(sortedProfiles, ctx);
      const displayName = override?.company ?? primary.name.replace(/^\* /, '');
      const contactName =
        override?.primaryContactName ?? primary.name.replace(/^\* /, '');
      const contactEmail = override?.primaryContactEmail ?? primary.email;

      return {
        id: mergeKey,
        company: displayName,
        status: override?.status ?? agentStatusFromProfiles(sortedProfiles),
        inactiveEffectiveDate: override?.inactiveEffectiveDate ?? null,
        keepOverridePartners: override?.keepOverridePartners,
        primaryContactName: contactName,
        primaryContactEmail: contactEmail,
        notes: override?.notes,
        mrc: 0,
        customerCount: customers.length,
        customers,
        tiers,
        tierIds: sortedProfiles.map((p) => p.id),
        commissionsLastMonth: 0,
        commissionsYtd: 0,
      } satisfies Agent;
    })
    .sort((a, b) => a.company.localeCompare(b.company));

  cachedAgents = result;
  cacheKey = key;
  cachedAllCustomers = ctx.allCustomers;
  return result;
}

export function getMergedAgent(mergeKey: string): Agent | null {
  return buildMergedAgents().find((a) => a.id === mergeKey) ?? null;
}

export function listAvailableCustomersForAgent(agent: Agent): AgentCustomerRef[] {
  const assigned = new Set(agent.customers.map((c) => c.id));
  const allCustomers = cachedAllCustomers.length ? cachedAllCustomers : createBuildContext().allCustomers;
  return allCustomers.filter((c) => !assigned.has(c.id));
}

const AGENTS_UPDATED_EVENT = 'candid-agents-updated';

if (typeof window !== 'undefined') {
  window.addEventListener(AGENTS_UPDATED_EVENT, () => {
    invalidateMergedAgentsCache();
  });
}
