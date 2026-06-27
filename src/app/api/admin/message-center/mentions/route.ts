import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listAdminTeamMembers } from '@/lib/admin-team-members';
import { renderNoteBody } from '@/lib/admin-action-work';
import { mentionNavTarget, type MentionInboxItem } from '@/lib/message-center';

function humanizeKind(kind: string): string {
  return kind
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function contextLabel(contextType: string, contextKey: string): string {
  if (contextType === 'action') {
    const idx = contextKey.indexOf(':');
    const kind = idx > 0 ? contextKey.slice(0, idx) : 'action';
    return `${humanizeKind(kind)} · Action Center`;
  }
  if (contextType === 'customer') return 'Account note';
  if (contextType === 'contact') return 'Contact note';
  return 'Note';
}

async function getUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  const { data: notifications, error } = await admin
    .from('team_mention_notifications')
    .select('id, note_id, message_id, channel_id, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = notifications ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const noteIds = [...new Set(rows.filter((n) => n.note_id).map((n) => String(n.note_id)))];
  const messageIds = [...new Set(rows.filter((n) => n.message_id).map((n) => String(n.message_id)))];
  const channelIds = [...new Set(rows.filter((n) => n.channel_id).map((n) => String(n.channel_id)))];

  const [notesRes, messagesRes, channelsRes, members] = await Promise.all([
    noteIds.length
      ? admin.from('team_notes').select('*').in('id', noteIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    messageIds.length
      ? admin.from('team_messages').select('*').in('id', messageIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    channelIds.length
      ? admin.from('team_channels').select('id, name, kind').in('id', channelIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    listAdminTeamMembers(admin),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const noteById = new Map(
    ((notesRes.data ?? []) as Record<string, unknown>[]).map((n) => [String(n.id), n]),
  );
  const msgById = new Map(
    ((messagesRes.data ?? []) as Record<string, unknown>[]).map((m) => [String(m.id), m]),
  );
  const channelById = new Map(
    ((channelsRes.data ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]),
  );

  const items: MentionInboxItem[] = [];
  for (const n of rows) {
    if (n.message_id) {
      const msg = msgById.get(String(n.message_id));
      if (!msg) continue;
      const channel = n.channel_id ? channelById.get(String(n.channel_id)) : undefined;
      const channelLabel = channel
        ? channel.kind === 'dm'
          ? 'Direct message'
          : `#${channel.name ?? 'channel'}`
        : 'Message Center';
      const authorId = String(msg.author_id);
      const msgBody = String(msg.body);
      items.push({
        notificationId: String(n.id),
        noteId: '',
        contextType: 'channel',
        contextKey: n.channel_id ? String(n.channel_id) : '',
        authorId,
        authorName: memberById.get(authorId)?.displayName ?? 'Team member',
        body: msgBody,
        bodyHtml: renderNoteBody(msgBody, members),
        createdAt: String(msg.created_at),
        readAt: (n.read_at as string) ?? null,
        nav: n.channel_id ? { kind: 'channel', channelId: String(n.channel_id) } : { kind: 'none' },
        contextLabel: channelLabel,
      });
      continue;
    }

    const note = noteById.get(String(n.note_id));
    if (!note) continue;
    const contextType = String(note.context_type) as MentionInboxItem['contextType'];
    const contextKey = String(note.context_key);
    const authorId = String(note.author_id);
    const noteBody = String(note.body);
    items.push({
      notificationId: String(n.id),
      noteId: String(n.note_id),
      contextType,
      contextKey,
      authorId,
      authorName: memberById.get(authorId)?.displayName ?? 'Team member',
      body: noteBody,
      bodyHtml: renderNoteBody(noteBody, members),
      createdAt: String(note.created_at),
      readAt: (n.read_at as string) ?? null,
      nav: mentionNavTarget(contextType, contextKey),
      contextLabel: contextLabel(contextType, contextKey),
    });
  }

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const role = await getMyRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { ids?: string[]; all?: boolean };
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  let query = admin
    .from('team_mention_notifications')
    .update({ read_at: now })
    .eq('user_id', userId)
    .is('read_at', null);

  if (!body.all && body.ids?.length) {
    query = query.in('id', body.ids);
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
