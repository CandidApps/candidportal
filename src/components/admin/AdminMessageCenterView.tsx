'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { fetchTeamMembers, postTeamNote } from '@/lib/team-notes';
import type { TeamMember } from '@/lib/admin-action-work';
import {
  createChannel,
  fetchChannels,
  fetchMentionInbox,
  fetchMessages,
  markChannelRead,
  markMentionsRead,
  postMessage,
  type MentionInboxItem,
  type TeamChannel,
  type TeamMessage,
} from '@/lib/message-center';

type Props = {
  currentUserId: string;
  onOpenAction: (ticketKind: string, sourceId: string) => void;
  onOpenCustomer: (customerId: string) => void;
};

const HANK_SUGGESTION: TeamMember = {
  id: '__hank__',
  email: 'hank@candid.ai',
  displayName: 'Hank (AI assistant)',
  handle: 'hank',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function renderChatBody(body: string, members: TeamMember[]): string {
  return escapeHtml(body).replace(/@([a-zA-Z0-9._-]+)/g, (full, raw: string) => {
    const handle = raw.toLowerCase();
    if (handle === 'hank') return `<span class="mc-mention mc-mention-hank">@hank</span>`;
    const member = members.find((m) => {
      const candidates = [m.handle.toLowerCase(), m.email.split('@')[0]?.toLowerCase()].filter(
        Boolean,
      );
      return candidates.includes(handle);
    });
    if (!member) return full;
    return `<span class="mc-mention">@${raw}</span>`;
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AdminMessageCenterView({
  currentUserId,
  onOpenAction,
  onOpenCustomer,
}: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pane, setPane] = useState<'channel' | 'mentions'>('channel');
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [mentions, setMentions] = useState<MentionInboxItem[]>([]);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hankThinking, setHankThinking] = useState(false);
  const [error, setError] = useState('');
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeId) ?? null,
    [channels, activeId],
  );
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const unreadMentions = useMemo(() => mentions.filter((m) => !m.readAt).length, [mentions]);

  const reloadChannels = useCallback(async () => {
    try {
      const next = await fetchChannels();
      setChannels(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channels');
      return [];
    }
  }, []);

  const reloadMentions = useCallback(async () => {
    try {
      setMentions(await fetchMentionInbox());
    } catch {
      /* non-fatal */
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [team, chans] = await Promise.all([fetchTeamMembers(), fetchChannels()]);
        if (cancelled) return;
        setMembers(team);
        setChannels(chans);
        const general = chans.find((c) => c.isGeneral) ?? chans[0];
        if (general) setActiveId(general.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    void reloadMentions();
    return () => {
      cancelled = true;
    };
  }, [reloadMentions]);

  // Load messages when active channel changes
  useEffect(() => {
    if (pane !== 'channel' || !activeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const msgs = await fetchMessages(activeId);
        if (cancelled) return;
        setMessages(msgs);
        await markChannelRead(activeId);
        setChannels((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, hasUnread: false } : c)),
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load messages');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, pane]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (pane === 'channel' && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, pane, hankThinking]);

  // Realtime: new messages + mention notifications
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('message-center')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_messages' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const channelId = String(row.channel_id);
          if (channelId === activeId && pane === 'channel') {
            const kind = (row.author_kind as TeamMessage['authorKind']) ?? 'user';
            const authorId = (row.author_id as string) ?? null;
            const incoming: TeamMessage = {
              id: String(row.id),
              channelId,
              authorId,
              authorKind: kind,
              authorName:
                kind === 'hank'
                  ? 'Hank'
                  : kind === 'system'
                    ? 'System'
                    : (authorId && memberById.get(authorId)?.displayName) || 'Teammate',
              body: String(row.body),
              mentionUserIds: [],
              createdAt: String(row.created_at),
            };
            setMessages((prev) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
            );
            if (kind === 'hank') setHankThinking(false);
            void markChannelRead(channelId);
          } else {
            void reloadChannels();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_mention_notifications' },
        () => {
          void reloadMentions();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, pane, memberById, reloadChannels, reloadMentions]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    const pool = [HANK_SUGGESTION, ...members.filter((m) => m.id !== currentUserId)];
    return pool
      .filter(
        (m) =>
          !q ||
          m.handle.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [mentionQuery, members, currentUserId]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const atMatch = value.slice(0, caret).match(/@([a-zA-Z0-9._-]*)$/);
    setMentionQuery(atMatch ? atMatch[1]! : null);
  };

  const insertMention = (member: TeamMember) => {
    const el = textareaRef.current;
    const value = draft;
    const caret = el?.selectionStart ?? value.length;
    const uptoCaret = value.slice(0, caret);
    const afterCaret = value.slice(caret);
    const atMatch = uptoCaret.match(/@([a-zA-Z0-9._-]*)$/);
    if (!atMatch) return;
    const start = caret - atMatch[0].length;
    const next = `${value.slice(0, start)}@${member.handle} ${afterCaret}`;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + member.handle.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId) return;
    const triggersHank = /@hank\b/i.test(body);
    setSending(true);
    setError('');
    setDraft('');
    setMentionQuery(null);
    if (triggersHank) setHankThinking(true);
    try {
      const { messages: created } = await postMessage({ channelId: activeId, body });
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...created.filter((m) => !seen.has(m.id))];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
      setHankThinking(false);
    }
  };

  const startChannel = async () => {
    const name = newChannelName.trim();
    if (!name) return;
    try {
      const created = await createChannel({ kind: 'channel', name });
      setNewChannelName('');
      setNewChannelOpen(false);
      await reloadChannels();
      setPane('channel');
      setActiveId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    }
  };

  const startDm = async (member: TeamMember) => {
    try {
      const created = await createChannel({ kind: 'dm', memberIds: [member.id] });
      setNewDmOpen(false);
      await reloadChannels();
      setPane('channel');
      setActiveId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start DM');
    }
  };

  const openMentions = async () => {
    setPane('mentions');
    await reloadMentions();
    await markMentionsRead();
    setMentions((prev) => prev.map((m) => ({ ...m, readAt: m.readAt ?? new Date().toISOString() })));
  };

  const navigateMention = (item: MentionInboxItem) => {
    if (item.nav.kind === 'action') onOpenAction(item.nav.ticketKind, item.nav.sourceId);
    else if (item.nav.kind === 'customer') onOpenCustomer(item.nav.customerId);
    else if (item.nav.kind === 'channel') {
      setPane('channel');
      setActiveId(item.nav.channelId);
    }
  };

  const submitReply = async (item: MentionInboxItem) => {
    const body = replyDraft.trim();
    if (!body) return;
    try {
      if (item.contextType === 'channel') {
        // Reply in the originating Message Center channel/DM.
        if (!item.contextKey) throw new Error('Channel not found for this mention');
        await postMessage({ channelId: item.contextKey, body });
      } else {
        await postTeamNote({
          contextType: item.contextType,
          contextKey: item.contextKey,
          body,
        });
      }
      setReplyDraft('');
      setReplyFor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    }
  };

  const channelList = channels.filter((c) => c.kind === 'channel');
  const dmList = channels.filter((c) => c.kind === 'dm');

  return (
    <div className="mc-root">
      <header className="mc-section-bar">
        <p className="mc-section-hint">
          Internal channels, DMs, and @mentions across the admin portal.
        </p>
      </header>

      <div className="mc-content">
      {/* Left rail */}
      <aside className="mc-rail">
        <button
          type="button"
          className={`mc-rail-item mc-rail-mentions${pane === 'mentions' ? ' active' : ''}`}
          onClick={() => void openMentions()}
        >
          <AppIcon name="alerts" size={14} />
          <span>Mentions</span>
          {unreadMentions > 0 && <span className="mc-badge">{unreadMentions}</span>}
        </button>

        <div className="mc-rail-section">
          <span>Channels</span>
          <button
            type="button"
            className="mc-rail-add"
            onClick={() => setNewChannelOpen((v) => !v)}
            title="Create channel"
          >
            <AppIcon name="add" size={11} />
          </button>
        </div>
        {newChannelOpen && (
          <div className="mc-new-row">
            <input
              className="mc-new-input"
              placeholder="channel-name"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void startChannel()}
            />
            <button type="button" className="mc-new-go" onClick={() => void startChannel()}>
              Add
            </button>
          </div>
        )}
        {channelList.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`mc-rail-item${pane === 'channel' && activeId === c.id ? ' active' : ''}`}
            onClick={() => {
              setPane('channel');
              setActiveId(c.id);
            }}
          >
            <span className="mc-hash">#</span>
            <span className="mc-rail-label">{c.name}</span>
            {c.hasUnread && <span className="mc-unread-dot" />}
          </button>
        ))}

        <div className="mc-rail-section">
          <span>Direct messages</span>
          <button
            type="button"
            className="mc-rail-add"
            onClick={() => setNewDmOpen((v) => !v)}
            title="New direct message"
          >
            <AppIcon name="add" size={11} />
          </button>
        </div>
        {newDmOpen && (
          <div className="mc-dm-picker">
            {members
              .filter((m) => m.id !== currentUserId)
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="mc-dm-option"
                  onClick={() => void startDm(m)}
                >
                  {m.displayName}
                </button>
              ))}
            {members.filter((m) => m.id !== currentUserId).length === 0 && (
              <div className="mc-dm-empty">No teammates found</div>
            )}
          </div>
        )}
        {dmList.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`mc-rail-item${pane === 'channel' && activeId === c.id ? ' active' : ''}`}
            onClick={() => {
              setPane('channel');
              setActiveId(c.id);
            }}
          >
            <AppIcon name="specialist" size={12} />
            <span className="mc-rail-label">{c.name}</span>
            {c.hasUnread && <span className="mc-unread-dot" />}
          </button>
        ))}
      </aside>

      {/* Main pane */}
      <section className="mc-main">
        {pane === 'mentions' ? (
          <>
            <header className="mc-header">
              <div className="mc-header-title">Mentions</div>
              <div className="mc-header-sub">
                Every place you were @mentioned across the admin app
              </div>
            </header>
            <div className="mc-mentions-list">
              {mentions.length === 0 ? (
                <div className="mc-empty">
                  No mentions yet. When a teammate @mentions you in a channel, Action Center, an
                  account, or a review, it shows up here.
                </div>
              ) : (
                mentions.map((item) => (
                  <div key={item.notificationId} className="mc-mention-card">
                    <div className="mc-mention-top">
                      <strong>{item.authorName}</strong>
                      <span className="mc-mention-context">{item.contextLabel}</span>
                      <span className="mc-mention-time">{formatTime(item.createdAt)}</span>
                    </div>
                    <div
                      className="mc-mention-body"
                      dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                    />
                    <div className="mc-mention-actions">
                      {item.nav.kind !== 'none' && (
                        <button
                          type="button"
                          className="mc-link-btn"
                          onClick={() => navigateMention(item)}
                        >
                          <AppIcon name="link" size={11} />{' '}
                          {item.nav.kind === 'channel'
                            ? `Open ${item.contextLabel}`
                            : `Open in ${item.contextLabel.split(' · ')[1] ?? 'app'}`}
                        </button>
                      )}
                      <button
                        type="button"
                        className="mc-link-btn"
                        onClick={() => {
                          setReplyFor(replyFor === item.notificationId ? null : item.notificationId);
                          setReplyDraft('');
                        }}
                      >
                        <AppIcon name="send" size={11} /> Reply
                      </button>
                    </div>
                    {replyFor === item.notificationId && (
                      <div className="mc-reply-row">
                        <textarea
                          className="mc-reply-input"
                          rows={2}
                          placeholder="Reply in this thread… @mention to notify"
                          value={replyDraft}
                          onChange={(e) => setReplyDraft(e.target.value)}
                        />
                        <button
                          type="button"
                          className="mc-send-btn"
                          disabled={!replyDraft.trim()}
                          onClick={() => void submitReply(item)}
                        >
                          Post
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <header className="mc-header">
              <div className="mc-header-title">
                {activeChannel?.kind === 'dm' ? (
                  <>
                    <AppIcon name="specialist" size={14} /> {activeChannel?.name}
                  </>
                ) : (
                  <>
                    <span className="mc-hash">#</span>
                    {activeChannel?.name ?? 'Select a channel'}
                  </>
                )}
              </div>
              <div className="mc-header-sub">
                {activeChannel?.topic ?? 'Tip: type @hank to bring the AI assistant into the chat'}
              </div>
            </header>

            <div className="mc-messages" ref={listRef}>
              {messages.length === 0 ? (
                <div className="mc-empty">No messages yet. Say hello 👋</div>
              ) : (
                messages.map((m) => {
                  const own = m.authorKind === 'user' && m.authorId === currentUserId;
                  return (
                    <div
                      key={m.id}
                      className={`mc-msg${own ? ' own' : ''}${m.authorKind === 'hank' ? ' hank' : ''}`}
                    >
                      <div className="mc-msg-avatar">
                        {m.authorKind === 'hank' ? (
                          <AppIcon name="hank" size={13} />
                        ) : (
                          m.authorName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="mc-msg-content">
                        <div className="mc-msg-meta">
                          <strong>{m.authorName}</strong>
                          {m.authorKind === 'hank' && <span className="mc-ai-tag">AI</span>}
                          <span>{formatTime(m.createdAt)}</span>
                        </div>
                        <div
                          className="mc-msg-bubble"
                          dangerouslySetInnerHTML={{
                            __html:
                              m.authorKind === 'hank'
                                ? m.body
                                : renderChatBody(m.body, members),
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
              {hankThinking && (
                <div className="mc-msg hank">
                  <div className="mc-msg-avatar">
                    <AppIcon name="hank" size={13} />
                  </div>
                  <div className="mc-msg-content">
                    <div className="mc-msg-meta">
                      <strong>Hank</strong>
                      <span className="mc-ai-tag">AI</span>
                    </div>
                    <div className="mc-msg-bubble mc-typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && <div className="mc-error">{error}</div>}

            <div className="mc-composer">
              {mentionSuggestions.length > 0 && (
                <div className="mc-mention-menu">
                  {mentionSuggestions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="mc-mention-opt"
                      onClick={() => insertMention(m)}
                    >
                      <strong>@{m.handle}</strong>
                      <span>{m.displayName}</span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                className="mc-input"
                rows={2}
                value={draft}
                disabled={!activeId || sending}
                placeholder={
                  activeChannel
                    ? `Message ${activeChannel.kind === 'dm' ? activeChannel.name : `#${activeChannel.name}`}… use @hank for AI`
                    : 'Select a channel'
                }
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && mentionQuery == null) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                className="mc-send-btn"
                disabled={!draft.trim() || sending || !activeId}
                onClick={() => void send()}
              >
                <AppIcon name="send" size={13} /> Send
              </button>
            </div>
          </>
        )}
      </section>
      </div>
    </div>
  );
}
