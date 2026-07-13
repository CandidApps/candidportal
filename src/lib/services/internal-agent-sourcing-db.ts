import type { SupabaseClient } from '@supabase/supabase-js';

export type PartnerSplitShare = {
  profileId: string;
  percent: number;
};

export type AgentSourcingRule = {
  agentMergeKey: string;
  label: string | null;
  sourcedByProfileId: string | null;
  partnerSplits: PartnerSplitShare[];
  updatedAt: string | null;
};

type Row = {
  agent_merge_key: string;
  label: string | null;
  sourced_by_profile_id: string | null;
  partner_splits: unknown;
  updated_at: string;
};

function parseSplits(raw: unknown): PartnerSplitShare[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const profileId = typeof row.profileId === 'string' ? row.profileId.trim() : '';
      const percent = typeof row.percent === 'number' ? row.percent : Number(row.percent);
      if (!profileId || !Number.isFinite(percent)) return null;
      return { profileId, percent };
    })
    .filter((s): s is PartnerSplitShare => s != null);
}

function rowToRule(row: Row): AgentSourcingRule {
  return {
    agentMergeKey: row.agent_merge_key,
    label: row.label,
    sourcedByProfileId: row.sourced_by_profile_id,
    partnerSplits: parseSplits(row.partner_splits),
    updatedAt: row.updated_at,
  };
}

export async function loadAgentSourcingRules(
  admin: SupabaseClient,
): Promise<AgentSourcingRule[]> {
  const { data, error } = await admin.from('internal_agent_sourcing').select('*');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(rowToRule);
}

export async function upsertAgentSourcingRule(
  admin: SupabaseClient,
  rule: {
    agentMergeKey: string;
    label?: string | null;
    sourcedByProfileId?: string | null;
    partnerSplits: PartnerSplitShare[];
  },
): Promise<void> {
  const { error } = await admin.from('internal_agent_sourcing').upsert(
    {
      agent_merge_key: rule.agentMergeKey,
      label: rule.label ?? null,
      sourced_by_profile_id: rule.sourcedByProfileId ?? null,
      partner_splits: rule.partnerSplits,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'agent_merge_key' },
  );
  if (error) throw new Error(error.message);
}

export async function deleteAgentSourcingRule(
  admin: SupabaseClient,
  agentMergeKey: string,
): Promise<void> {
  const { error } = await admin
    .from('internal_agent_sourcing')
    .delete()
    .eq('agent_merge_key', agentMergeKey);
  if (error) throw new Error(error.message);
}
