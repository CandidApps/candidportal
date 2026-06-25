'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import type { TeamMember } from '@/lib/admin-action-work';
import { fetchTeamMembers, fetchTeamNotes, postTeamNote, type TeamNoteRecord } from '@/lib/team-notes';
import {
  createAssistantTask,
  deleteAssistantTask,
  fetchAssistantOverview,
  fetchAssistantTasks,
  updateAssistantTask,
  type AssistantOverview,
  type AssistantTask,
  type AssistantTaskPriority,
} from '@/lib/assistant/types';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PRIORITY_LABEL: Record<AssistantTaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function fmtClock(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const ACTION_ICON: Record<string, AppIconName> = {
  ticket: 'messages',
  review_request: 'sparkles',
  analysis_review: 'chart',
  reminder: 'alerts',
};

export default function AdminAssistantView({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserName: string;
}) {
  const [overview, setOverview] = useState<AssistantOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [taskScope, setTaskScope] = useState<'mine' | 'team'>('mine');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<AssistantTaskPriority>('normal');
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const first = currentUserName.split(/\s+/)[0] ?? 'there';

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchAssistantOverview();
      setOverview(data);
    } catch {
      setOverview(null);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await fetchAssistantTasks(taskScope));
    } catch {
      setTasks([]);
    }
  }, [taskScope]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await Promise.all([loadOverview(), loadTasks()]);
      try {
        const m = await fetchTeamMembers();
        if (!cancelled) setMembers(m);
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOverview(), loadTasks()]);
    setRefreshing(false);
  };

  // ── Calendar week buckets ──
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AssistantOverview['calendar']['events']>();
    for (const ev of overview?.calendar.events ?? []) {
      const k = dayKey(ev.start);
      const arr = map.get(k) ?? [];
      arr.push(ev);
      map.set(k, arr);
    }
    return map;
  }, [overview]);

  const selectedDay = days[activeDay] ?? days[0];
  const selectedKey = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  const addTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    setNewTaskTitle('');
    try {
      const task = await createAssistantTask({ title, priority: newTaskPriority });
      setTasks((prev) => [task, ...prev]);
    } catch {
      void loadTasks();
    }
  };

  const patchTask = async (id: string, patch: Parameters<typeof updateAssistantTask>[1]) => {
    try {
      const updated = await updateAssistantTask(id, patch);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      void loadTasks();
    }
  };

  const removeTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteAssistantTask(id);
    } catch {
      void loadTasks();
    }
  };

  const counts = overview?.counts ?? { actions: 0, mentions: 0, eventsToday: 0, emails: 0 };
  const openTasks = tasks.filter((t) => t.status !== 'done');

  const kpis: { key: string; label: string; value: number; accent: string; icon: AppIconName }[] = [
    { key: 'cal', label: "Today's meetings", value: counts.eventsToday, accent: 'blue', icon: 'calendar' },
    { key: 'tasks', label: 'Open tasks', value: openTasks.length, accent: 'red', icon: 'check' },
    { key: 'actions', label: 'Items to action', value: counts.actions, accent: 'amber', icon: 'alerts' },
    { key: 'mentions', label: 'Unread mentions', value: counts.mentions, accent: 'green', icon: 'messages' },
  ];

  return (
    <>
      <div className="greeting assist-greeting">
        <div>
          <h2>
            {greetingForNow()}, {first}.
          </h2>
          <p>Your day and week at a glance — meetings, priorities, and what needs you.</p>
        </div>
        <button type="button" className="assist-refresh" onClick={refresh} disabled={refreshing}>
          <AppIcon name="sync" size={13} className={refreshing ? 'spin' : undefined} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="kpi-strip">
        {kpis.map((k) => (
          <div key={k.key} className={`kpi ${k.accent}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{loading ? '—' : k.value}</div>
            <span className="kpi-icon">
              <AppIcon name={k.icon} size={22} />
            </span>
          </div>
        ))}
      </div>

      <div className="assist-grid">
        <div className="assist-col">
          {/* ── CALENDAR ── */}
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="calendar" size={14} /> This week
              </div>
            </div>
            <div className="assist-day-tabs">
              {days.map((d, i) => {
                const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                const count = eventsByDay.get(k)?.length ?? 0;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`assist-day-tab${i === activeDay ? ' active' : ''}${i === 0 ? ' today' : ''}`}
                    onClick={() => setActiveDay(i)}
                  >
                    <span className="assist-day-name">{i === 0 ? 'Today' : DOW[d.getDay()]}</span>
                    <span className="assist-day-date">{d.getDate()}</span>
                    <span className="assist-day-count">{count ? `${count}` : '—'}</span>
                  </button>
                );
              })}
            </div>
            <div className="card-body">
              {!overview?.calendar.connected && !loading && (
                <ConnectPrompt
                  title="Connect your Zoho calendar"
                  body="Link your Zoho mailbox to pull in meetings and Dialpad call recaps."
                  cta="Connect Zoho"
                />
              )}
              {overview?.calendar.connected && !overview.calendar.calendarScope && (
                <ConnectPrompt
                  title="Enable calendar access"
                  body="Your Zoho is connected for email. Reconnect to grant calendar access so meetings show here."
                  cta="Reconnect Zoho"
                />
              )}
              {overview?.calendar.calendarScope && selectedEvents.length === 0 && (
                <p className="assist-empty">No meetings scheduled for this day.</p>
              )}
              {selectedEvents.map((ev) => (
                <div key={ev.id} className="assist-event">
                  <div className="assist-event-time">
                    {ev.allDay ? 'All day' : fmtClock(new Date(ev.start))}
                  </div>
                  <div className="assist-event-body">
                    <div className="assist-event-title">{ev.title}</div>
                    <div className="assist-event-meta">
                      {ev.location && <span>{ev.location}</span>}
                      {ev.attendeeCount > 0 && (
                        <span>
                          <AppIcon name="specialist" size={10} /> {ev.attendeeCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {ev.conferenceUrl && (
                    <a
                      className="assist-event-join"
                      href={ev.conferenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Join →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── TASKS ── */}
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="check" size={14} /> Priorities &amp; tasks
              </div>
              <div className="assist-tabs">
                <button
                  type="button"
                  className={`assist-tab${taskScope === 'mine' ? ' active' : ''}`}
                  onClick={() => setTaskScope('mine')}
                >
                  Mine
                </button>
                <button
                  type="button"
                  className={`assist-tab${taskScope === 'team' ? ' active' : ''}`}
                  onClick={() => setTaskScope('team')}
                >
                  Team
                </button>
              </div>
            </div>
            <div className="card-body">
              <div className="assist-task-add">
                <input
                  className="assist-task-input"
                  placeholder="Add a task…"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void addTask()}
                />
                <select
                  className="assist-select"
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as AssistantTaskPriority)}
                >
                  {(['urgent', 'high', 'normal', 'low'] as AssistantTaskPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
                <button type="button" className="assist-add-btn" onClick={() => void addTask()}>
                  <AppIcon name="add" size={12} /> Add
                </button>
              </div>

              {tasks.length === 0 && !loading && (
                <p className="assist-empty">No tasks here yet. Add one above.</p>
              )}

              {tasks.map((t) => (
                <div key={t.id} className={`assist-task assist-task--${t.status}`}>
                  <button
                    type="button"
                    className={`assist-check${t.status === 'done' ? ' done' : ''}`}
                    onClick={() =>
                      void patchTask(t.id, { status: t.status === 'done' ? 'open' : 'done' })
                    }
                    aria-label="Toggle done"
                  >
                    {t.status === 'done' && <AppIcon name="check" size={11} />}
                  </button>
                  <div className="assist-task-body">
                    <div className="assist-task-title">{t.title}</div>
                    <div className="assist-task-meta">
                      <span className={`assist-pri assist-pri--${t.priority}`}>
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                      <select
                        className="assist-owner-select"
                        value={t.ownerId}
                        onChange={(e) => void patchTask(t.id, { ownerId: e.target.value })}
                        title="Reassign"
                      >
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.id === currentUserId ? 'Me' : m.displayName}
                          </option>
                        ))}
                        {!members.some((m) => m.id === t.ownerId) && (
                          <option value={t.ownerId}>{t.ownerName}</option>
                        )}
                      </select>
                      {t.dueDate && <span className="assist-task-due">{fmtDue(t.dueDate)}</span>}
                      <button
                        type="button"
                        className="assist-task-link"
                        onClick={() => setOpenThreadId(openThreadId === t.id ? null : t.id)}
                      >
                        <AppIcon name="messages" size={11} /> Discuss
                      </button>
                      <button
                        type="button"
                        className="assist-task-link assist-task-link--danger"
                        onClick={() => void removeTask(t.id)}
                      >
                        Remove
                      </button>
                    </div>
                    {openThreadId === t.id && <TaskThread taskId={t.id} members={members} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="assist-col">
          {/* ── ACTIONS ── */}
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="alerts" size={14} /> Needs action
              </div>
              <span className="assist-count-pill">{counts.actions}</span>
            </div>
            <div className="card-body assist-scroll">
              {(overview?.actions.length ?? 0) === 0 && !loading && (
                <p className="assist-empty">Nothing outstanding. Nice work.</p>
              )}
              {overview?.actions.slice(0, 12).map((a) => (
                <div key={a.id} className="assist-action">
                  <span className={`assist-dot assist-dot--${a.urgency}`} />
                  <span className="assist-action-icon">
                    <AppIcon name={ACTION_ICON[a.kind] ?? 'alerts'} size={13} />
                  </span>
                  <div className="assist-action-body">
                    <div className="assist-action-title">{a.title}</div>
                    <div className="assist-action-sub">
                      {a.subtitle}
                      {a.who ? ` · ${a.who}` : ''}
                      {a.dueAt ? ` · due ${fmtDue(a.dueAt)}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── EMAIL ── */}
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="email" size={14} /> Email to handle
              </div>
              <span className="assist-count-pill">{counts.emails}</span>
            </div>
            <div className="card-body assist-scroll">
              {!overview?.email.connected && !loading && (
                <ConnectPrompt
                  title="Connect your mailbox"
                  body="Link Zoho Mail to see messages that still need a reply."
                  cta="Connect Zoho"
                />
              )}
              {overview?.email.connected && overview.email.needsAction.length === 0 && (
                <p className="assist-empty">Inbox zero — nothing waiting on a reply.</p>
              )}
              {overview?.email.needsAction.map((m) => (
                <div key={m.id} className="assist-mail">
                  <span className="assist-dot assist-dot--warn" />
                  <div className="assist-action-body">
                    <div className="assist-action-title">{m.subject}</div>
                    <div className="assist-action-sub">
                      {m.from}
                      {m.receivedTime ? ` · ${relativeTime(new Date(m.receivedTime).toISOString())}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── RECAPS ── */}
          {(overview?.recaps.length ?? 0) > 0 && (
            <div className="card assist-card">
              <div className="card-header">
                <div className="card-title">
                  <AppIcon name="sparkles" size={14} /> Dialpad call recaps
                </div>
              </div>
              <div className="card-body assist-scroll">
                {overview?.recaps.slice(0, 8).map((m) => (
                  <div key={m.id} className="assist-mail">
                    <span className="assist-dot assist-dot--normal" />
                    <div className="assist-action-body">
                      <div className="assist-action-title">{m.subject}</div>
                      <div className="assist-action-sub">
                        {m.receivedTime
                          ? relativeTime(new Date(m.receivedTime).toISOString())
                          : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── MENTIONS ── */}
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="messages" size={14} /> My mentions
              </div>
              <span className="assist-count-pill">{counts.mentions}</span>
            </div>
            <div className="card-body assist-scroll">
              {(overview?.mentions.length ?? 0) === 0 && !loading && (
                <p className="assist-empty">No unread mentions.</p>
              )}
              {overview?.mentions.map((m) => (
                <div key={m.id} className="assist-mention">
                  <div className="assist-mention-head">
                    <strong>{m.authorName}</strong>
                    <span className="assist-mention-ctx">{m.contextLabel}</span>
                    <span className="assist-mention-time">{relativeTime(m.createdAt)}</span>
                  </div>
                  <div
                    className="assist-mention-body"
                    dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ConnectPrompt({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div className="assist-connect">
      <div className="assist-connect-icon">
        <AppIcon name="link" size={18} />
      </div>
      <div className="assist-connect-body">
        <div className="assist-connect-title">{title}</div>
        <div className="assist-connect-sub">{body}</div>
      </div>
      <a className="assist-connect-btn" href="/api/zoho/oauth/start">
        {cta}
      </a>
    </div>
  );
}

function TaskThread({ taskId, members }: { taskId: string; members: TeamMember[] }) {
  const [notes, setNotes] = useState<TeamNoteRecord[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchTeamNotes('task', taskId);
        if (!cancelled) setNotes(data);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const note = await postTeamNote({ contextType: 'task', contextKey: taskId, body: text });
      setNotes((prev) => [...prev, note]);
      setBody('');
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const handles = members
    .slice(0, 4)
    .map((m) => m.handle)
    .join(' ');

  return (
    <div className="assist-thread">
      {loaded && notes.length === 0 && (
        <div className="assist-thread-empty">
          Start the thread. Mention a teammate with {handles || '@name'} to loop them in.
        </div>
      )}
      {notes.map((n) => (
        <div key={n.id} className="assist-thread-msg">
          <span className="assist-thread-author">{n.authorName}</span>
          <span
            className="assist-thread-text"
            dangerouslySetInnerHTML={{ __html: renderInline(n.body) }}
          />
        </div>
      ))}
      <div ref={endRef} />
      <div className="assist-thread-input-row">
        <input
          className="assist-task-input"
          placeholder="Comment or @mention a teammate…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          disabled={busy}
        />
        <button type="button" className="assist-add-btn" onClick={() => void send()} disabled={busy}>
          <AppIcon name="send" size={12} />
        </button>
      </div>
    </div>
  );
}

function renderInline(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/@([a-z0-9._-]+)/gi, '<span class="assist-mention-tag">@$1</span>');
}
