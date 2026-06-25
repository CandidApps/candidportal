'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import type { TeamMember } from '@/lib/admin-action-work';
import { fetchTeamMembers, fetchTeamNotes, postTeamNote, type TeamNoteRecord } from '@/lib/team-notes';
import {
  addAssistantContext,
  createAssistantTask,
  createCalendarEvent,
  deleteAssistantContext,
  deleteAssistantTask,
  deleteCalendarEvent,
  fetchAssistantBrief,
  fetchAssistantContext,
  fetchAssistantOverview,
  fetchAssistantTasks,
  fetchCalendarWeek,
  fetchReplyDraft,
  sendEmailReply,
  updateAssistantTask,
  updateCalendarEvent,
  type AssistantBriefResult,
  type AssistantCalendarEvent,
  type AssistantContextItem,
  type AssistantOverview,
  type AssistantRecap,
  type AssistantRef,
  type AssistantTask,
  type AssistantTaskPriority,
  type CalendarEventInput,
  type TriagedEmail,
} from '@/lib/assistant/types';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PRIORITY_LABEL: Record<AssistantTaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const TAG_LABEL: Record<TriagedEmail['tag'], string> = {
  urgent: 'Urgent',
  partner: 'Partner',
  customer: 'Customer',
  renewal: 'Renewal',
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

function emailAddr(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

const ACTION_ICON: Record<string, AppIconName> = {
  ticket: 'messages',
  review_request: 'sparkles',
  analysis_review: 'chart',
  reminder: 'alerts',
};

/** Modal target for the AI reply / compose composer. */
type ComposeTarget = {
  to: string;
  subject: string;
  lookupEmail: string;
  messageId?: string;
  folderId?: string;
  contextLabel?: string;
};

const SECTIONS: { id: string; label: string; icon: AppIconName }[] = [
  { id: 'asec-brief', label: 'Your brief', icon: 'sparkles' },
  { id: 'asec-calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'asec-actions', label: 'Portal actions & tickets', icon: 'alerts' },
  { id: 'asec-email', label: 'Email to handle', icon: 'email' },
  { id: 'asec-tasks', label: 'Priorities & tasks', icon: 'check' },
  { id: 'asec-recaps', label: 'Call recaps', icon: 'messages' },
  { id: 'asec-mentions', label: 'My mentions', icon: 'specialist' },
  { id: 'asec-memory', label: 'What Hank knows', icon: 'hank' },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function AdminAssistantView({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserName: string;
}) {
  const [overview, setOverview] = useState<AssistantOverview | null>(null);
  const [brief, setBrief] = useState<AssistantBriefResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [taskScope, setTaskScope] = useState<'mine' | 'team'>('mine');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [context, setContext] = useState<AssistantContextItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<AssistantTaskPriority>('normal');
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState<ComposeTarget | null>(null);

  const first = currentUserName.split(/\s+/)[0] ?? 'there';

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await fetchAssistantOverview());
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

  const loadContext = useCallback(async () => {
    try {
      setContext(await fetchAssistantContext());
    } catch {
      setContext([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await Promise.all([loadOverview(), loadTasks(), loadContext()]);
      try {
        const m = await fetchTeamMembers();
        if (!cancelled) setMembers(m);
      } catch {
        /* ignore */
      }
      try {
        const b = await fetchAssistantBrief(false);
        if (!cancelled) setBrief(b);
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

  const [briefBusy, setBriefBusy] = useState(false);
  const regenerateBrief = useCallback(async () => {
    setBriefBusy(true);
    try {
      setBrief(await fetchAssistantBrief(true));
    } catch {
      /* ignore */
    } finally {
      setBriefBusy(false);
    }
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOverview(), loadTasks(), loadContext()]);
    setRefreshing(false);
    void regenerateBrief();
  };

  const recapByEvent = useMemo(() => {
    const map = new Map<string, AssistantRecap>();
    for (const r of overview?.recaps ?? []) {
      if (r.matchedEventId) map.set(r.matchedEventId, r);
    }
    return map;
  }, [overview]);

  const unmatchedRecaps = useMemo(
    () => (overview?.recaps ?? []).filter((r) => !r.matchedEventId),
    [overview],
  );

  const inboxById = useMemo(() => {
    const map = new Map<string, AssistantOverview['email']['inbox'][number]>();
    for (const m of overview?.email.inbox ?? []) map.set(m.id, m);
    return map;
  }, [overview]);

  const openReplyForInbox = useCallback(
    (item: AssistantOverview['email']['inbox'][number], label?: string) => {
      setCompose({
        to: emailAddr(item.from),
        subject: /^re:/i.test(item.subject) ? item.subject : `Re: ${item.subject}`,
        lookupEmail: emailAddr(item.from),
        messageId: item.id,
        folderId: item.folderId,
        contextLabel: label ?? item.subject,
      });
    },
    [],
  );

  const openRef = useCallback(
    (ref: AssistantRef | null | undefined) => {
      if (!ref) return;
      if (ref.type === 'email') {
        const item = inboxById.get(ref.id);
        if (item) {
          openReplyForInbox(item);
          return;
        }
        scrollToSection('asec-email');
      } else if (ref.type === 'action') scrollToSection('asec-actions');
      else if (ref.type === 'calendar') scrollToSection('asec-calendar');
      else if (ref.type === 'task') scrollToSection('asec-tasks');
      else if (ref.type === 'recap') scrollToSection('asec-recaps');
    },
    [inboxById, openReplyForInbox],
  );

  const addTask = async (
    title: string,
    opts?: { priority?: AssistantTaskPriority; source?: string; key?: string },
  ) => {
    const t = title.trim();
    if (!t) return;
    if (opts?.key) setAddedKeys((prev) => new Set(prev).add(opts.key!));
    try {
      const task = await createAssistantTask({
        title: t,
        priority: opts?.priority ?? newTaskPriority,
        source: opts?.source,
      });
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
  const triaged = brief?.triagedEmails ?? [];

  const kpis: { key: string; label: string; value: number; accent: string; icon: AppIconName; section: string }[] = [
    { key: 'cal', label: "Today's meetings", value: counts.eventsToday, accent: 'blue', icon: 'calendar', section: 'asec-calendar' },
    { key: 'tasks', label: 'Open tasks', value: openTasks.length, accent: 'red', icon: 'check', section: 'asec-tasks' },
    { key: 'actions', label: 'Portal items', value: counts.actions, accent: 'amber', icon: 'alerts', section: 'asec-actions' },
    { key: 'email', label: 'Emails to reply', value: triaged.length || counts.emails, accent: 'green', icon: 'email', section: 'asec-email' },
  ];

  return (
    <>
      <div className="greeting assist-greeting">
        <div>
          <h2>
            {greetingForNow()}, {first}.
          </h2>
          <p>Your single pane — meetings, call recaps, priorities, and what needs you next.</p>
        </div>
        <button type="button" className="assist-refresh" onClick={refresh} disabled={refreshing}>
          <AppIcon name="sync" size={13} className={refreshing ? 'spin' : undefined} />
          {refreshing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <div className="kpi-strip">
        {kpis.map((k) => (
          <button key={k.key} type="button" className={`kpi ${k.accent}`} onClick={() => scrollToSection(k.section)}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{loading ? '—' : k.value}</div>
            <span className="kpi-icon">
              <AppIcon name={k.icon} size={22} />
            </span>
          </button>
        ))}
      </div>

      <div className="assist-stack">
        {/* ── AI WEEK BRIEF ── */}
        <div id="asec-brief" className="assist-anchor">
          <BriefCard
            brief={brief?.brief ?? null}
            busy={briefBusy}
            loading={loading}
            onRegenerate={regenerateBrief}
            onRef={openRef}
          />
        </div>

        {/* ── CALENDAR ── */}
        <div id="asec-calendar" className="assist-anchor">
          <CalendarSection
            recapByEvent={recapByEvent}
            addedKeys={addedKeys}
            onAddTask={(title, key) => void addTask(title, { source: 'recap', key, priority: 'normal' })}
            onEmailAttendees={(ev) => {
              const emails = ev.attendees.map((a) => a.email).filter(Boolean);
              if (emails.length === 0) return;
              setCompose({
                to: emails.join(', '),
                subject: `Regarding: ${ev.title}`,
                lookupEmail: emails[0],
                contextLabel: ev.title,
              });
            }}
          />
        </div>

        {/* ── PORTAL ACTIONS & TICKETS ── */}
        <div id="asec-actions" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="alerts" size={14} /> Portal actions &amp; tickets
              </div>
              <span className="assist-count-pill">{counts.actions}</span>
            </div>
            <div className="card-body assist-scroll">
              {(overview?.actions.length ?? 0) === 0 && !loading && (
                <p className="assist-empty">Nothing outstanding in the portal. Nice work.</p>
              )}
              {overview?.actions.slice(0, 20).map((a) => {
                const key = `action:${a.id}`;
                return (
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
                    <button
                      type="button"
                      className={`assist-action-add${addedKeys.has(key) ? ' added' : ''}`}
                      title="Add as task"
                      onClick={() =>
                        void addTask(a.title, {
                          source: 'action',
                          key,
                          priority: a.urgency === 'urgent' ? 'urgent' : 'high',
                        })
                      }
                      disabled={addedKeys.has(key)}
                    >
                      <AppIcon name={addedKeys.has(key) ? 'check' : 'add'} size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── EMAIL TO HANDLE ── */}
        <div id="asec-email" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="email" size={14} /> Email to handle
              </div>
              <span className="assist-count-pill">{triaged.length || counts.emails}</span>
            </div>
            <div className="card-body assist-scroll">
              {!overview?.email.connected && !loading && (
                <ConnectPrompt
                  title="Connect your mailbox"
                  body="Link Zoho Mail so the assistant can triage what needs a reply."
                  cta="Connect Zoho"
                />
              )}
              {overview?.email.connected && triaged.length === 0 && (
                <p className="assist-empty">
                  {brief?.brief.generatedAt
                    ? 'Nothing in your inbox needs a reply right now.'
                    : 'Run Sync to triage your inbox with AI.'}
                </p>
              )}
              {triaged.map((t) => {
                const item = inboxById.get(t.id);
                const key = `email:${t.id}`;
                return (
                  <div key={t.id} className={`assist-triage assist-triage--${t.section}`}>
                    <button
                      type="button"
                      className="assist-triage-open"
                      onClick={() =>
                        item
                          ? openReplyForInbox(item, `${t.contact}${t.business && t.business !== 'Unknown' ? ` · ${t.business}` : ''}`)
                          : undefined
                      }
                      disabled={!item}
                    >
                      <div className="assist-triage-head">
                        <span className={`assist-tag assist-tag--${t.tag}`}>{TAG_LABEL[t.tag]}</span>
                        <span className="assist-triage-contact">
                          {t.contact}
                          {t.business && t.business !== 'Unknown' ? ` · ${t.business}` : ''}
                        </span>
                        {item?.receivedTime ? (
                          <span className="assist-triage-time">
                            {relativeTime(new Date(item.receivedTime).toISOString())}
                          </span>
                        ) : null}
                      </div>
                      <div className="assist-triage-title">{t.title}</div>
                      {t.insight && <div className="assist-triage-insight">{t.insight}</div>}
                    </button>
                    <div className="assist-triage-actions">
                      <button
                        type="button"
                        className="assist-mini-btn primary"
                        onClick={() => (item ? openReplyForInbox(item) : undefined)}
                        disabled={!item}
                      >
                        <AppIcon name="sparkles" size={11} /> Reply with AI
                      </button>
                      <button
                        type="button"
                        className={`assist-mini-btn${addedKeys.has(key) ? ' added' : ''}`}
                        onClick={() =>
                          void addTask(`Reply: ${t.title}`, {
                            source: 'email',
                            key,
                            priority: t.tag === 'urgent' ? 'urgent' : 'high',
                          })
                        }
                        disabled={addedKeys.has(key)}
                      >
                        <AppIcon name={addedKeys.has(key) ? 'check' : 'add'} size={11} />
                        {addedKeys.has(key) ? 'Added' : 'Task'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── TASKS ── */}
        <div id="asec-tasks" className="assist-anchor">
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void addTask(newTaskTitle);
                      setNewTaskTitle('');
                    }
                  }}
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
                <button
                  type="button"
                  className="assist-add-btn"
                  onClick={() => {
                    void addTask(newTaskTitle);
                    setNewTaskTitle('');
                  }}
                >
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

        {/* ── OTHER CALL RECAPS ── */}
        <div id="asec-recaps" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="messages" size={14} /> Call recaps
              </div>
              <span className="assist-count-pill">{unmatchedRecaps.length}</span>
            </div>
            <div className="card-body assist-scroll">
              {unmatchedRecaps.length === 0 && !loading && (
                <p className="assist-empty">No call recaps outside your meetings.</p>
              )}
              {unmatchedRecaps.slice(0, 10).map((r) => (
                <RecapBlock
                  key={r.id}
                  recap={r}
                  addedKeys={addedKeys}
                  onAddTask={(title, key) =>
                    void addTask(title, { source: 'recap', key, priority: 'normal' })
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── MENTIONS ── */}
        <div id="asec-mentions" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="specialist" size={14} /> My mentions
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

        {/* ── WHAT HANK KNOWS (memory) ── */}
        <div id="asec-memory" className="assist-anchor">
          <div className="card assist-card">
            <div className="card-header">
              <div className="card-title">
                <AppIcon name="hank" size={14} /> What Hank knows
              </div>
              <span className="assist-count-pill">{context.length}</span>
            </div>
            <div className="card-body">
              <MemoryEditor
                context={context}
                onForget={async (id) => {
                  setContext((prev) => prev.filter((c) => c.id !== id));
                  try {
                    await deleteAssistantContext(id);
                  } catch {
                    void loadContext();
                  }
                }}
                onRemember={async (subject, info) => {
                  try {
                    const item = await addAssistantContext({ subject, info });
                    setContext((prev) => [item, ...prev]);
                  } catch {
                    /* ignore */
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── SCROLL-TO RAIL ── */}
      <nav className="acct-section-rail" aria-label="Jump to assistant section">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="acct-section-rail-btn"
            onClick={() => scrollToSection(s.id)}
            aria-label={s.label}
          >
            <AppIcon name={s.icon} size={15} />
            <span className="acct-section-rail-tip">{s.label}</span>
          </button>
        ))}
      </nav>

      {compose && (
        <ComposeModal
          target={compose}
          currentUserName={currentUserName}
          onClose={() => setCompose(null)}
        />
      )}
    </>
  );
}

// ── AI WEEK BRIEF ──────────────────────────────────────────────────
function BriefCard({
  brief,
  busy,
  loading,
  onRegenerate,
  onRef,
}: {
  brief: AssistantBriefResult['brief'] | null;
  busy: boolean;
  loading: boolean;
  onRegenerate: () => void;
  onRef: (ref: AssistantRef | null | undefined) => void;
}) {
  const hasBrief = brief && (brief.weekStatus || brief.priorities.length || brief.highlights.length);
  return (
    <div className="card assist-brief">
      <div className="assist-brief-head">
        <div className="assist-brief-title">
          <AppIcon name="sparkles" size={15} /> Your brief
          {brief?.generatedAt && (
            <span className="assist-brief-time">· updated {relativeTime(brief.generatedAt)}</span>
          )}
        </div>
        <button type="button" className="assist-brief-refresh" onClick={onRegenerate} disabled={busy}>
          <AppIcon name="sync" size={12} className={busy ? 'spin' : undefined} />
          {busy ? 'Thinking…' : 'Regenerate'}
        </button>
      </div>

      {busy && !hasBrief && (
        <div className="assist-brief-loading">
          <span className="assist-spinner" /> Reading your week…
        </div>
      )}

      {!busy && !hasBrief && !loading && (
        <div className="assist-brief-empty">
          <p>Generate an AI brief of your meetings, calls, and inbox to see where to start.</p>
          <button type="button" className="assist-brief-cta" onClick={onRegenerate}>
            <AppIcon name="sparkles" size={13} /> Generate brief
          </button>
        </div>
      )}

      {hasBrief && (
        <div className="assist-brief-body">
          {brief!.recommendation && (
            <button
              type="button"
              className={`assist-brief-rec${brief!.recommendationRef ? ' clickable' : ''}`}
              onClick={() => onRef(brief!.recommendationRef)}
              disabled={!brief!.recommendationRef}
            >
              <span className="assist-brief-rec-label">
                <AppIcon name="bolt" size={12} /> Start here
              </span>
              <span className="assist-brief-rec-text">{brief!.recommendation}</span>
              {brief!.recommendationRef && (
                <span className="assist-brief-rec-go">
                  {brief!.recommendationRef.type === 'email' ? 'Respond now' : 'Open'} →
                </span>
              )}
            </button>
          )}
          {brief!.weekStatus && <div className="assist-brief-status">{brief!.weekStatus}</div>}
          <div className="assist-brief-cols">
            {brief!.highlights.length > 0 && (
              <div className="assist-brief-section">
                <div className="assist-brief-label">
                  <AppIcon name="check" size={11} /> So far
                </div>
                <ul className="assist-brief-highlights">
                  {brief!.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            {brief!.priorities.length > 0 && (
              <div className="assist-brief-section">
                <div className="assist-brief-label">
                  <AppIcon name="alerts" size={11} /> Priorities now
                </div>
                <ol className="assist-brief-priorities">
                  {brief!.priorities.map((p, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className={`assist-brief-prio${p.ref ? ' clickable' : ''}`}
                        onClick={() => onRef(p.ref)}
                        disabled={!p.ref}
                      >
                        <span className="assist-brief-pnum">{i + 1}</span>
                        <span className="assist-brief-pcontent">
                          <span className="assist-brief-ptitle">{p.title}</span>
                          {p.why && <span className="assist-brief-pwhy">{p.why}</span>}
                        </span>
                        {p.ref && <span className="assist-brief-pgo">→</span>}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CALENDAR (week navigation + detail + create/edit) ──────────────
function startOfWeek(offset: number): Date {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function CalendarSection({
  recapByEvent,
  addedKeys,
  onAddTask,
  onEmailAttendees,
}: {
  recapByEvent: Map<string, AssistantRecap>;
  addedKeys: Set<string>;
  onAddTask: (title: string, key: string) => void;
  onEmailAttendees: (ev: AssistantCalendarEvent) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [events, setEvents] = useState<AssistantCalendarEvent[]>([]);
  const [state, setState] = useState<{ connected: boolean; scope: boolean; loading: boolean; error?: string }>({
    connected: false,
    scope: false,
    loading: true,
  });
  const [detail, setDetail] = useState<AssistantCalendarEvent | null>(null);
  const [editing, setEditing] = useState<AssistantCalendarEvent | 'new' | null>(null);

  const load = useCallback(async (offset: number) => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetchCalendarWeek(offset);
      setEvents(res.events);
      setState({ connected: res.connected, scope: res.calendarScope, loading: false, error: res.error });
    } catch (e) {
      setEvents([]);
      setState({ connected: false, scope: false, loading: false, error: e instanceof Error ? e.message : 'Failed' });
    }
  }, []);

  useEffect(() => {
    void load(weekOffset);
  }, [load, weekOffset]);

  const weekStart = startOfWeek(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const weekEnd = days[6];
  const todayKey = `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}`;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AssistantCalendarEvent[]>();
    for (const ev of events) {
      const k = dayKey(ev.start);
      const arr = map.get(k) ?? [];
      arr.push(ev);
      map.set(k, arr);
    }
    return map;
  }, [events]);

  const rangeLabel = `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[weekEnd.getMonth()]} ${weekEnd.getDate()}`;

  return (
    <div className="card assist-card">
      <div className="card-header">
        <div className="card-title">
          <AppIcon name="calendar" size={14} /> Calendar
        </div>
        <div className="assist-cal-nav">
          <button type="button" className="assist-cal-navbtn" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
            <AppIcon name="panelCollapse" size={12} />
          </button>
          <button type="button" className={`assist-cal-today${weekOffset === 0 ? ' active' : ''}`} onClick={() => setWeekOffset(0)}>
            {weekOffset === 0 ? 'This week' : 'Today'}
          </button>
          <button type="button" className="assist-cal-navbtn" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">
            <AppIcon name="panelExpand" size={12} />
          </button>
          <span className="assist-cal-range">{rangeLabel}</span>
          <button type="button" className="assist-cal-add" onClick={() => setEditing('new')}>
            <AppIcon name="add" size={11} /> New event
          </button>
        </div>
      </div>
      <div className="card-body">
        {!state.connected && !state.loading && (
          <ConnectPrompt
            title="Connect your Zoho calendar"
            body="Link your Zoho mailbox to pull in meetings and Dialpad call recaps."
            cta="Connect Zoho"
          />
        )}
        {state.connected && !state.scope && (
          <ConnectPrompt
            title="Enable calendar access"
            body="Your Zoho is connected for email. Reconnect to grant calendar access so meetings show here."
            cta="Reconnect Zoho"
          />
        )}
        {state.scope && (
          <div className="assist-week">
            {days.map((d) => {
              const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const dayEvents = eventsByDay.get(k) ?? [];
              const isToday = k === todayKey;
              return (
                <div key={k} className={`assist-weekday${isToday ? ' today' : ''}`}>
                  <div className="assist-weekday-head">
                    <span className="assist-weekday-name">{DOW[d.getDay()]}</span>
                    <span className="assist-weekday-date">{d.getDate()}</span>
                  </div>
                  <div className="assist-weekday-events">
                    {dayEvents.length === 0 && <span className="assist-weekday-empty">—</span>}
                    {dayEvents.map((ev) => {
                      const recap = recapByEvent.get(ev.id) ?? null;
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          className="assist-cal-event"
                          onClick={() => setDetail(ev)}
                        >
                          <span className="assist-cal-event-time">
                            {ev.allDay ? 'All day' : fmtClock(new Date(ev.start))}
                          </span>
                          <span className="assist-cal-event-title">{ev.title}</span>
                          <span className="assist-cal-event-meta">
                            {ev.attendeeCount > 0 && (
                              <span className="assist-cal-event-att">
                                <AppIcon name="specialist" size={9} /> {ev.attendeeCount}
                              </span>
                            )}
                            {recap && (
                              <span className="assist-cal-event-recap">
                                <AppIcon name="sparkles" size={9} /> Recap
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {state.error && <p className="assist-empty">Calendar error: {state.error}</p>}
      </div>

      {detail && (
        <EventDetailModal
          event={detail}
          recap={recapByEvent.get(detail.id) ?? null}
          addedKeys={addedKeys}
          onAddTask={onAddTask}
          onEmail={() => {
            onEmailAttendees(detail);
            setDetail(null);
          }}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onDelete={async () => {
            try {
              await deleteCalendarEvent(detail.id, detail.etag);
              setDetail(null);
              void load(weekOffset);
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Delete failed');
            }
          }}
          onClose={() => setDetail(null)}
        />
      )}

      {editing && (
        <EventEditModal
          event={editing === 'new' ? null : editing}
          defaultDate={weekOffset === 0 ? new Date() : weekStart}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load(weekOffset);
          }}
        />
      )}
    </div>
  );
}

function EventDetailModal({
  event,
  recap,
  addedKeys,
  onAddTask,
  onEmail,
  onEdit,
  onDelete,
  onClose,
}: {
  event: AssistantCalendarEvent;
  recap: AssistantRecap | null;
  addedKeys: Set<string>;
  onAddTask: (title: string, key: string) => void;
  onEmail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal" role="dialog" aria-label="Event details">
        <div className="assist-modal-head">
          <div className="assist-modal-title">{event.title}</div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <div className="assist-modal-meta">
            <AppIcon name="calendar" size={12} />{' '}
            {start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            {event.allDay ? ' · All day' : ` · ${fmtClock(start)} – ${fmtClock(end)}`}
          </div>
          {event.location && (
            <div className="assist-modal-meta">
              <AppIcon name="building" size={12} /> {event.location}
            </div>
          )}
          {event.conferenceUrl && (
            <div className="assist-modal-meta">
              <AppIcon name="link" size={12} />{' '}
              <a href={event.conferenceUrl} target="_blank" rel="noreferrer">
                Join meeting
              </a>
            </div>
          )}
          {event.description && <div className="assist-modal-desc">{event.description}</div>}

          {event.attendees.length > 0 && (
            <div className="assist-modal-section">
              <div className="assist-modal-label">Participants ({event.attendees.length})</div>
              <div className="assist-attendees">
                {event.attendees.map((a) => (
                  <div key={a.email || a.name} className="assist-attendee">
                    <span className={`assist-att-dot assist-att-dot--${a.status}`} />
                    <span className="assist-att-name">{a.name}</span>
                    {a.email && <span className="assist-att-email">{a.email}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {recap && (
            <div className="assist-modal-section">
              <div className="assist-modal-label">
                <AppIcon name="sparkles" size={11} /> Call recap
              </div>
              <RecapBlock recap={recap} addedKeys={addedKeys} onAddTask={onAddTask} embedded />
            </div>
          )}
        </div>
        <div className="assist-modal-foot">
          {event.attendees.some((a) => a.email) && (
            <button type="button" className="assist-mini-btn primary" onClick={onEmail}>
              <AppIcon name="email" size={11} /> Email attendees
            </button>
          )}
          <button type="button" className="assist-mini-btn" onClick={onEdit}>
            <AppIcon name="settings" size={11} /> Edit
          </button>
          <button type="button" className="assist-mini-btn danger" onClick={onDelete}>
            <AppIcon name="close" size={11} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventEditModal({
  event,
  defaultDate,
  onClose,
  onSaved,
}: {
  event: AssistantCalendarEvent | null;
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initStart = event ? new Date(event.start) : (() => {
    const d = new Date(defaultDate);
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  })();
  const initEnd = event ? new Date(event.end) : new Date(initStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(toDateInput(initStart));
  const [startTime, setStartTime] = useState(toTimeInput(initStart));
  const [endTime, setEndTime] = useState(toTimeInput(initEnd));
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [attendees, setAttendees] = useState(event ? event.attendees.map((a) => a.email).filter(Boolean).join(', ') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setBusy(true);
    setError(null);
    const startIso = new Date(`${date}T${allDay ? '00:00' : startTime}`).toISOString();
    const endIso = new Date(`${date}T${allDay ? '23:59' : endTime}`).toISOString();
    const payload: CalendarEventInput = {
      title: title.trim(),
      start: startIso,
      end: endIso,
      allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      attendees: attendees
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      if (event) {
        await updateCalendarEvent(event.id, { ...payload, etag: event.etag });
      } else {
        await createCalendarEvent(payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal" role="dialog" aria-label="Edit event">
        <div className="assist-modal-head">
          <div className="assist-modal-title">{event ? 'Edit event' : 'New event'}</div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body assist-form">
          <label className="assist-field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title" />
          </label>
          <label className="assist-field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {!allDay && (
            <div className="assist-field-row">
              <label className="assist-field">
                <span>Start</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label className="assist-field">
                <span>End</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </label>
            </div>
          )}
          <label className="assist-field assist-field--check">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            <span>All day</span>
          </label>
          <label className="assist-field">
            <span>Location</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </label>
          <label className="assist-field">
            <span>Attendees (comma-separated emails)</span>
            <input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="name@company.com, …" />
          </label>
          <label className="assist-field">
            <span>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional" />
          </label>
          {error && <div className="assist-form-error">{error}</div>}
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="assist-mini-btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : event ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI COMPOSE / REPLY ─────────────────────────────────────────────
function ComposeModal({
  target,
  currentUserName,
  onClose,
}: {
  target: ComposeTarget;
  currentUserName: string;
  onClose: () => void;
}) {
  const [to, setTo] = useState(target.to);
  const [subject, setSubject] = useState(target.subject);
  const [bodyText, setBodyText] = useState('');
  const [hint, setHint] = useState('');
  const [knowledge, setKnowledge] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (h?: string) => {
      setDrafting(true);
      setError(null);
      try {
        const res = await fetchReplyDraft({
          messageId: target.messageId,
          folderId: target.folderId,
          from: target.lookupEmail,
          subject: target.subject,
          hint: h,
        });
        setBodyText(res.draft);
        setKnowledge(res.knowledge);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Draft failed');
      } finally {
        setDrafting(false);
      }
    },
    [target],
  );

  useEffect(() => {
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    if (!to.trim() || !bodyText.trim()) {
      setError('Recipient and message are required');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendEmailReply({ to: to.trim(), subject: subject.trim() || '(no subject)', text: bodyText });
      setSent(true);
      setTimeout(onClose, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-compose" role="dialog" aria-label="Compose reply">
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="sparkles" size={14} /> AI reply{target.contextLabel ? ` · ${target.contextLabel}` : ''}
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          {knowledge.length > 0 && (
            <div className="assist-compose-knows">
              <span className="assist-compose-knows-label">Hank knows:</span>
              {knowledge.slice(0, 4).map((k, i) => (
                <span key={i} className="assist-know-chip">
                  {k}
                </span>
              ))}
            </div>
          )}
          <label className="assist-field">
            <span>To</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="assist-field">
            <span>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <div className="assist-compose-body">
            {drafting ? (
              <div className="assist-brief-loading">
                <span className="assist-spinner" /> Drafting a reply from your history &amp; portal knowledge…
              </div>
            ) : (
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={12}
                placeholder="Write your reply…"
              />
            )}
          </div>
          <div className="assist-compose-redraft">
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Tell Hank how to adjust (e.g. shorter, offer a call Tuesday)…"
              onKeyDown={(e) => e.key === 'Enter' && void generate(hint)}
              disabled={drafting}
            />
            <button type="button" className="assist-mini-btn" onClick={() => void generate(hint)} disabled={drafting}>
              <AppIcon name="sync" size={11} className={drafting ? 'spin' : undefined} /> Redraft
            </button>
          </div>
          {error && <div className="assist-form-error">{error}</div>}
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="button" className="assist-mini-btn primary" onClick={() => void send()} disabled={sending || drafting || sent}>
            <AppIcon name="send" size={11} /> {sent ? 'Sent ✓' : sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecapBlock({
  recap,
  addedKeys,
  onAddTask,
  embedded,
}: {
  recap: AssistantRecap;
  addedKeys: Set<string>;
  onAddTask: (title: string, key: string) => void;
  embedded?: boolean;
}) {
  return (
    <div className={`assist-recap${embedded ? ' assist-recap--embedded' : ''}`}>
      {!embedded && <div className="assist-recap-title">{recap.title}</div>}
      {recap.summary && <div className="assist-recap-summary">{recap.summary}</div>}
      {recap.actionItems.length > 0 && (
        <div className="assist-recap-actions">
          <div className="assist-recap-actions-label">Action items</div>
          {recap.actionItems.map((a, i) => {
            const key = `recap:${recap.id}:${i}`;
            return (
              <div key={i} className="assist-recap-item">
                <span className="assist-recap-num">{i + 1}</span>
                <span className="assist-recap-text">{a}</span>
                <button
                  type="button"
                  className={`assist-recap-add${addedKeys.has(key) ? ' added' : ''}`}
                  onClick={() => onAddTask(a, key)}
                  disabled={addedKeys.has(key)}
                >
                  <AppIcon name={addedKeys.has(key) ? 'check' : 'add'} size={10} />
                  {addedKeys.has(key) ? 'Added' : 'Task'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemoryEditor({
  context,
  onForget,
  onRemember,
}: {
  context: AssistantContextItem[];
  onForget: (id: string) => void;
  onRemember: (subject: string, info: string) => void;
}) {
  const [subject, setSubject] = useState('');
  const [info, setInfo] = useState('');
  const save = () => {
    if (!subject.trim() || !info.trim()) return;
    onRemember(subject.trim(), info.trim());
    setSubject('');
    setInfo('');
  };
  return (
    <div className="assist-memory">
      <div className="assist-memory-add">
        <input
          className="assist-task-input"
          placeholder="Person or company"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <input
          className="assist-task-input"
          placeholder="What to remember…"
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button type="button" className="assist-add-btn" onClick={save}>
          <AppIcon name="add" size={12} />
        </button>
      </div>
      {context.length === 0 && (
        <p className="assist-empty">
          Nothing remembered yet. Hank learns about people and businesses as you work, and uses it to draft smarter replies.
        </p>
      )}
      {context.map((c) => (
        <div key={c.id} className="assist-memory-item">
          <div className="assist-memory-text">
            <strong>{c.subject}</strong>: {c.info}
          </div>
          <button
            type="button"
            className="assist-task-link assist-task-link--danger"
            onClick={() => onForget(c.id)}
          >
            Forget
          </button>
        </div>
      ))}
    </div>
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
