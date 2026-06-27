import type { AdminTicketKind } from '@/lib/admin-tickets';

export type ChannelKind = 'channel' | 'dm';
export type MessageAuthorKind = 'user' | 'hank' | 'system';

export type TeamChannel = {
  id: string;
  kind: ChannelKind;
  name: string;
  topic: string | null;
  isGeneral: boolean;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  /** For DMs: the other participant's user id + display name. */
  dmPeerId?: string | null;
  dmPeerName?: string | null;
  /** Whether the current user has unread messages in this channel. */
  hasUnread: boolean;
};

export type TeamMessage = {
  id: string;
  channelId: string;
  authorId: string | null;
  authorKind: MessageAuthorKind;
  authorName: string;
  body: string;
  mentionUserIds: string[];
  createdAt: string;
  /** True while a Hank reply is being generated (client-only optimistic state). */
  pending?: boolean;
};

export type MentionNavTarget =
  | { kind: 'action'; ticketKind: AdminTicketKind; sourceId: string }
  | { kind: 'customer'; customerId: string }
  | { kind: 'channel'; channelId: string }
  | { kind: 'none' };

export type MentionInboxItem = {
  notificationId: string;
  noteId: string;
  contextType: 'action' | 'customer' | 'contact' | 'channel';
  contextKey: string;
  authorId: string;
  authorName: string;
  /** Raw note body with @handles. */
  body: string;
  /** Pre-rendered HTML with highlighted mentions. */
  bodyHtml: string;
  createdAt: string;
  readAt: string | null;
  nav: MentionNavTarget;
  /** Short human label for where this mention lives. */
  contextLabel: string;
};

/** Resolve a team_notes context into a Message Center navigation target. */
export function mentionNavTarget(
  contextType: string,
  contextKey: string,
): MentionNavTarget {
  if (contextType === 'action') {
    const idx = contextKey.indexOf(':');
    if (idx > 0) {
      return {
        kind: 'action',
        ticketKind: contextKey.slice(0, idx) as AdminTicketKind,
        sourceId: contextKey.slice(idx + 1),
      };
    }
    return { kind: 'none' };
  }
  if (contextType === 'customer') {
    return { kind: 'customer', customerId: contextKey };
  }
  return { kind: 'none' };
}

// ── Client fetchers ───────────────────────────────────────────

export async function fetchChannels(): Promise<TeamChannel[]> {
  const res = await fetch('/api/admin/message-center/channels');
  if (!res.ok) throw new Error('Failed to load channels');
  const json = (await res.json()) as { channels?: TeamChannel[] };
  return json.channels ?? [];
}

export async function createChannel(input: {
  kind: ChannelKind;
  name?: string;
  topic?: string;
  memberIds?: string[];
}): Promise<TeamChannel> {
  const res = await fetch('/api/admin/message-center/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { channel?: TeamChannel; error?: string };
  if (!res.ok || !json.channel) throw new Error(json.error ?? 'Failed to create channel');
  return json.channel;
}

export async function fetchMessages(channelId: string): Promise<TeamMessage[]> {
  const params = new URLSearchParams({ channelId });
  const res = await fetch(`/api/admin/message-center/messages?${params}`);
  if (!res.ok) throw new Error('Failed to load messages');
  const json = (await res.json()) as { messages?: TeamMessage[] };
  return json.messages ?? [];
}

export async function postMessage(input: {
  channelId: string;
  body: string;
}): Promise<{ messages: TeamMessage[]; hankPending: boolean }> {
  const res = await fetch('/api/admin/message-center/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as {
    messages?: TeamMessage[];
    hankPending?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? 'Failed to send message');
  return { messages: json.messages ?? [], hankPending: Boolean(json.hankPending) };
}

export async function markChannelRead(channelId: string): Promise<void> {
  await fetch('/api/admin/message-center/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId }),
  });
}

export async function fetchMentionInbox(): Promise<MentionInboxItem[]> {
  const res = await fetch('/api/admin/message-center/mentions');
  if (!res.ok) throw new Error('Failed to load mentions');
  const json = (await res.json()) as { items?: MentionInboxItem[] };
  return json.items ?? [];
}

export async function markMentionsRead(ids?: string[]): Promise<void> {
  await fetch('/api/admin/message-center/mentions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids } : { all: true }),
  });
}
