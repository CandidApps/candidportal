import type {
  InternalCommissionParticipant,
  InternalParticipantPatch,
  InternalParticipantType,
  InternalParticipantStatus,
} from '@/lib/team/internal-participant-types';
import type { SupabaseClient } from '@supabase/supabase-js';

type ProfileJoin = { display_name: string | null; email: string | null };

type ParticipantRow = {
  profile_id: string;
  participant_type: InternalParticipantType;
  default_house_share_percent: number;
  house_share_rate_of_net: number | null;
  optional_agent_comm_id: string | null;
  notes: string | null;
  status: InternalParticipantStatus;
  updated_at: string;
  profiles: ProfileJoin | ProfileJoin[] | null;
};

function resolveProfile(row: ParticipantRow): ProfileJoin | null {
  if (!row.profiles) return null;
  return Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles;
}

function rowToParticipant(row: ParticipantRow): InternalCommissionParticipant {
  const profile = resolveProfile(row);
  return {
    profileId: row.profile_id,
    displayName: profile?.display_name?.trim() || profile?.email?.trim() || 'Team member',
    email: profile?.email?.trim() || '',
    participantType: row.participant_type,
    defaultHouseSharePercent: Number(row.default_house_share_percent) || 0,
    houseShareRateOfNet:
      row.house_share_rate_of_net == null ? null : Number(row.house_share_rate_of_net),
    optionalAgentCommId: row.optional_agent_comm_id,
    notes: row.notes,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export async function loadInternalCommissionParticipants(
  admin: SupabaseClient,
): Promise<InternalCommissionParticipant[]> {
  const { data, error } = await admin
    .from('internal_commission_participants')
    .select(
      'profile_id, participant_type, default_house_share_percent, house_share_rate_of_net, optional_agent_comm_id, notes, status, updated_at, profiles(display_name, email)',
    )
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as ParticipantRow[]).map(rowToParticipant).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  );
}

export async function upsertInternalCommissionParticipant(
  admin: SupabaseClient,
  profileId: string,
  patch: InternalParticipantPatch,
): Promise<void> {
  const row: Record<string, unknown> = {
    profile_id: profileId,
    updated_at: new Date().toISOString(),
  };

  if (patch.participantType !== undefined) row.participant_type = patch.participantType;
  if (patch.defaultHouseSharePercent !== undefined) {
    row.default_house_share_percent = patch.defaultHouseSharePercent;
  }
  if (patch.houseShareRateOfNet !== undefined) row.house_share_rate_of_net = patch.houseShareRateOfNet;
  if (patch.optionalAgentCommId !== undefined) row.optional_agent_comm_id = patch.optionalAgentCommId;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.status !== undefined) row.status = patch.status;

  const { error } = await admin
    .from('internal_commission_participants')
    .upsert(row, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
}

export async function deleteInternalCommissionParticipant(
  admin: SupabaseClient,
  profileId: string,
): Promise<void> {
  const { error } = await admin
    .from('internal_commission_participants')
    .delete()
    .eq('profile_id', profileId);
  if (error) throw new Error(error.message);
}
