'use client';

import { rebuildAgentRateIndex } from '@/lib/bmw/deal-master';
import type { BmwAgentRate } from '@/lib/bmw/types';
import { getCrmRuntimeData, setCrmRuntimeData } from '@/lib/crm/runtime-store';
import { invalidateMergedAgentsCache } from '@/lib/bmw/merged-agents';

/** Create or update an agent rate profile (DB + client runtime). */
export async function upsertBmwAgentRate(input: {
  name: string;
  commissionRate: number;
  email?: string;
  id?: string;
}): Promise<BmwAgentRate> {
  const res = await fetch('/api/admin/bmw-agent-rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Could not save agent');
  }
  const data = (await res.json()) as { agent: BmwAgentRate };
  const agent = data.agent;
  const existing = getCrmRuntimeData().agentRates;
  const next = existing.some((a) => a.id === agent.id)
    ? existing.map((a) => (a.id === agent.id ? agent : a))
    : [...existing, agent];
  setCrmRuntimeData({ agentRates: next });
  rebuildAgentRateIndex();
  invalidateMergedAgentsCache();
  return agent;
}
