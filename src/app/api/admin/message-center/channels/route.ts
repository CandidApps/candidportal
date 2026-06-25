import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import type { TeamMember } from '@/lib/admin-action-work';
import type { ChannelKind, TeamChannel } from '@/lib/message-center';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function hasUnread(lastMessageAt: string | null, lastReadAt: string | null): boolean {
  if (!lastMessageAt) return false;
  if (!lastReadAt) return true;
  return new Date(lastMessageAt).getTime() > new Date(lastReadAt).getTime();
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function mapChannels(
  admin: AdminClient,
  userId: string,
  members: TeamMember[],
): Promise<TeamChannel[]> {
  const memberById = new Map(members.map((m) => [m.id, m]));

  const { data: myMemberships } = await admin
    .from('team_channel_members')
    .select('channel_id, last_read_at')
    .eq('user_id', userId);

  const lastReadByChannel = new Map<string, string | null>();
  const myChannelIds = new Set<string>();
  for (const row of myMemberships ?? []) {
    lastReadByChannel.set(String(row.channel_id), (row.last_read_at as string) ?? null);
    myChannelIds.add(String(row.channel_id));
  }

  const { data: openChannels } = await admin
    .from('team_channels')
    .select('*')
    .eq('kind', 'channel');

  const dmIds = [...myChannelIds];
  const { data: dmChannels } = dmIds.length
    ? await admin.from('team_channels').select('*').eq('kind', 'dm').in('id', dmIds)
    : { data: [] as Record<string, unknown>[] };

  // Resolve DM peers in one query
  const dmChannelIds = (dmChannels ?? []).map((c) => String(c.id));
  const peerByChannel = new Map<string, { id: string; name: string }>();
  if (dmChannelIds.length) {
    const { data: dmMembers } = await admin
      .from('team_channel_members')
      .select('channel_id, user_id')
      .in('channel_id', dmChannelIds);
    for (const row of dmMembers ?? []) {
      const otherId = String(row.user_id);
      if (otherId === userId) continue;
      peerByChannel.set(String(row.channel_id), {
        id: otherId,
        name: memberById.get(otherId)?.displayName ?? 'Teammate',
      });
    }
  }

  const rows = [...(openChannels ?? []), ...(dmChannels ?? [])];
  const channels: TeamChannel[] = rows.map((row) => {
    const id = String(row.id);
    const kind = (row.kind as ChannelKind) ?? 'channel';
    const lastReadAt = lastReadByChannel.get(id) ?? null;
    const lastMessageAt = (row.last_message_at as string) ?? null;
    const peer = peerByChannel.get(id);
    return {
      id,
      kind,
      name:
        kind === 'dm'
          ? peer?.name ?? 'Direct message'
          : String(row.name ?? 'channel'),
      topic: (row.topic as string) ?? null,
      isGeneral: Boolean(row.is_general),
      lastMessageAt,
      lastReadAt,
      dmPeerId: peer?.id ?? null,
      dmPeerName: peer?.name ?? null,
      hasUnread: hasUnread(lastMessageAt, lastReadAt),
    };
  });

  channels.sort((a, b) => {
    if (a.isGeneral !== b.isGeneral) return a.isGeneral ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === 'channel' ? -1 : 1;
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    if (at !== bt) return bt - at;
    return a.name.localeCompare(b.name);
  });

  return channels;
}

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const members = await listAdminTeamMembers(admin);
  const channels = await mapChannels(admin, userId, members);
  return NextResponse.json({ channels });
}

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    kind?: ChannelKind;
    name?: string;
    topic?: string;
    memberIds?: string[];
  };

  const admin = createSupabaseAdminClient();
  const members = await listAdminTeamMembers(admin);
  const memberById = new Map(members.map((m) => [m.id, m]));

  if (body.kind === 'dm') {
    const otherId = (body.memberIds ?? []).find((id) => id && id !== userId);
    if (!otherId) {
      return NextResponse.json({ error: 'A DM requires another teammate' }, { status: 400 });
    }
    const dmKey = [userId, otherId].sort().join(':');

    const { data: existing } = await admin
      .from('team_channels')
      .select('*')
      .eq('dm_key', dmKey)
      .maybeSingle();

    let channelRow = existing as Record<string, unknown> | null;
    if (!channelRow) {
      const { data, error } = await admin
        .from('team_channels')
        .insert({ kind: 'dm', dm_key: dmKey, created_by: userId })
        .select('*')
        .single();
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 });
      }
      channelRow = data;
      await admin.from('team_channel_members').upsert(
        [
          { channel_id: data.id, user_id: userId },
          { channel_id: data.id, user_id: otherId },
        ],
        { onConflict: 'channel_id,user_id' },
      );
    }

    const peer = memberById.get(otherId);
    const id = String(channelRow!.id);
    return NextResponse.json({
      channel: {
        id,
        kind: 'dm',
        name: peer?.displayName ?? 'Direct message',
        topic: null,
        isGeneral: false,
        lastMessageAt: (channelRow!.last_message_at as string) ?? null,
        lastReadAt: null,
        dmPeerId: otherId,
        dmPeerName: peer?.displayName ?? 'Teammate',
        hasUnread: false,
      } satisfies TeamChannel,
    });
  }

  // Default: create an open channel
  const name = (body.name ?? '').trim().replace(/^#/, '');
  if (!name) {
    return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('team_channels')
    .insert({
      kind: 'channel',
      name,
      topic: body.topic?.trim() || null,
      created_by: userId,
    })
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 });
  }

  await admin
    .from('team_channel_members')
    .upsert({ channel_id: data.id, user_id: userId }, { onConflict: 'channel_id,user_id' });

  return NextResponse.json({
    channel: {
      id: String(data.id),
      kind: 'channel',
      name: String(data.name),
      topic: (data.topic as string) ?? null,
      isGeneral: Boolean(data.is_general),
      lastMessageAt: null,
      lastReadAt: null,
      dmPeerId: null,
      dmPeerName: null,
      hasUnread: false,
    } satisfies TeamChannel,
  });
}
