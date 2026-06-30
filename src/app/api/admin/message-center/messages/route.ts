import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { resolveMentionUserIds, type TeamMember } from '@/lib/admin-action-work';
import { askHankServer, type HankChatMessage } from '@/lib/hank/server';
import { TEAM_CHAT_HANK_PROMPT } from '@/lib/candid-data';
import { sendAdminPush } from '@/lib/notifications/push';
import type { MessageAuthorKind, TeamMessage } from '@/lib/message-center';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const HANK_TRIGGER = /@hank\b/i;
const RECENT_CONTEXT = 16;

function authorName(
  kind: MessageAuthorKind,
  authorId: string | null,
  memberById: Map<string, TeamMember>,
): string {
  if (kind === 'hank') return 'Hank';
  if (kind === 'system') return 'System';
  return (authorId && memberById.get(authorId)?.displayName) || 'Teammate';
}

function mapMessage(
  row: Record<string, unknown>,
  memberById: Map<string, TeamMember>,
): TeamMessage {
  const kind = (row.author_kind as MessageAuthorKind) ?? 'user';
  const authorId = (row.author_id as string) ?? null;
  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    authorId,
    authorKind: kind,
    authorName: authorName(kind, authorId, memberById),
    body: String(row.body),
    mentionUserIds: Array.isArray(row.mention_user_ids)
      ? (row.mention_user_ids as string[])
      : [],
    createdAt: String(row.created_at),
  };
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function getUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function generateHankReply(
  admin: AdminClient,
  channelId: string,
  memberById: Map<string, TeamMember>,
): Promise<TeamMessage | null> {
  const { data: recent } = await admin
    .from('team_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(RECENT_CONTEXT);

  const ordered = (recent ?? []).slice().reverse();
  const transcript = ordered
    .map((row) => {
      const kind = (row.author_kind as MessageAuthorKind) ?? 'user';
      const name = authorName(kind, (row.author_id as string) ?? null, memberById);
      return `${name}: ${stripHtml(String(row.body))}`;
    })
    .join('\n');

  const prompt = `Here is the recent team-chat conversation:\n\n${transcript}\n\nRespond as Hank to the most recent message that mentioned you. Reply with just your chat message.`;
  const messages: HankChatMessage[] = [{ role: 'user', content: prompt }];

  let reply: string;
  try {
    reply = await askHankServer(messages, { systemPrompt: TEAM_CHAT_HANK_PROMPT });
  } catch (err) {
    console.error('Hank team-chat reply failed:', err);
    reply = "I couldn't reach my brain just now — give me another @hank in a moment.";
  }

  const { data, error } = await admin
    .from('team_messages')
    .insert({
      channel_id: channelId,
      author_id: null,
      author_kind: 'hank',
      body: reply,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('Failed to store Hank reply:', error?.message);
    return null;
  }
  return mapMessage(data as Record<string, unknown>, memberById);
}

export async function GET(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const members = await listAdminTeamMembers(admin);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const { data, error } = await admin
    .from('team_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = (data ?? []).map((row) =>
    mapMessage(row as Record<string, unknown>, memberById),
  );
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { channelId?: string; body?: string };
  const text = body.body?.trim();
  if (!body.channelId || !text) {
    return NextResponse.json({ error: 'channelId and body required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const members = await listAdminTeamMembers(admin);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const mentionUserIds = resolveMentionUserIds(text, members).filter((id) => id !== userId);

  const { data, error } = await admin
    .from('team_messages')
    .insert({
      channel_id: body.channelId,
      author_id: userId,
      author_kind: 'user',
      body: text,
      mention_user_ids: mentionUserIds,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Send failed' }, { status: 500 });
  }

  // Surface channel @mentions in MyMentions / Message Center mention inbox.
  if (mentionUserIds.length) {
    await admin.from('team_mention_notifications').insert(
      mentionUserIds.map((uid) => ({
        message_id: data.id,
        channel_id: body.channelId,
        user_id: uid,
      })),
    );

    // Push a notification to each mentioned teammate (respects their per-type
    // push preference; best-effort, never blocks the send).
    const fromName = memberById.get(userId)?.displayName || 'A teammate';
    const preview = stripHtml(text).slice(0, 120);
    await Promise.all(
      mentionUserIds.map((uid) =>
        sendAdminPush(uid, 'mentions', {
          title: `${fromName} mentioned you`,
          body: preview,
          url: '/',
        }).catch(() => undefined),
      ),
    );
  }

  // Mark the channel read for the sender
  await admin
    .from('team_channel_members')
    .upsert(
      { channel_id: body.channelId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'channel_id,user_id' },
    );

  const out: TeamMessage[] = [mapMessage(data as Record<string, unknown>, memberById)];

  if (HANK_TRIGGER.test(text)) {
    const hankMsg = await generateHankReply(admin, body.channelId, memberById);
    if (hankMsg) out.push(hankMsg);
  }

  return NextResponse.json({ messages: out, hankPending: false });
}
