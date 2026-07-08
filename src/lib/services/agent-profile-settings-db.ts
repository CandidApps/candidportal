import type { AgentProfileOverride } from '@/lib/agents/agent-assignments';
import type { SupabaseClient } from '@supabase/supabase-js';

type ProfileRow = {
  merge_key: string;
  profile: AgentProfileOverride;
  updated_at: string;
};

export async function loadAgentProfileSettings(
  admin: SupabaseClient,
): Promise<Record<string, AgentProfileOverride>> {
  const { data, error } = await admin.from('agent_profile_settings').select('merge_key, profile');
  if (error) throw new Error(error.message);

  const out: Record<string, AgentProfileOverride> = {};
  for (const row of (data ?? []) as ProfileRow[]) {
    if (row.merge_key && row.profile && typeof row.profile === 'object') {
      out[row.merge_key] = row.profile;
    }
  }
  return out;
}

export async function upsertAgentProfileSetting(
  admin: SupabaseClient,
  mergeKey: string,
  profile: AgentProfileOverride,
): Promise<void> {
  const { error } = await admin.from('agent_profile_settings').upsert(
    {
      merge_key: mergeKey,
      profile,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'merge_key' },
  );
  if (error) throw new Error(error.message);
}
