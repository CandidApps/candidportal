'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { RichTextEditor } from '@/components/RichTextEditor';
import type { TeamMember } from '@/lib/admin-action-work';
import {
  datetimeLocalToIso,
  formatTaskDue,
  isTaskOverdue,
  taskDueIso,
  taskDueTone,
  toDatetimeLocalValue,
} from '@/lib/assistant/task-due';
import {
  resolveTaskSourceMeta,
  TASK_SLASH_COMMANDS,
  type AssistantTaskSourceMeta,
  type SourceMetaLookup,
  type TaskSlashCommandId,
} from '@/lib/assistant/task-source';
import type {
  AssistantActionKind,
  AssistantEmailItem,
  AssistantTask,
  AssistantTaskPriority,
  TriagedEmail,
} from '@/lib/assistant/types';
import { searchPortalContacts } from '@/lib/assistant/types';
import { fetchContactDetail } from '@/lib/crm/contact-detail';
import { fetchTeamNotes, postTeamNote, type TeamNoteRecord } from '@/lib/team-notes';
import { isRichHtmlEmpty, richHtmlToPlainText, sanitizeRichHtml } from '@/lib/rich-text';

const PRIORITY_LABEL: Record<AssistantTaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  email: 'Email',
  action: 'Portal action',
  call: 'Call',
  recap: 'Recap',
  mention: 'Mention',
  brief: 'Brief',
};

type TaskFilters = {
  priority: AssistantTaskPriority | 'all';
  source: string;
  assignee: string;
  due: 'all' | 'today' | 'week' | 'overdue' | 'none';
};

export type { TaskFilters };

export function AssistantTaskFiltersBar({
  filters,
  onChange,
  members,
  currentUserId,
  sourceOptions,
}: {
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  members: TeamMember[];
  currentUserId: string;
  sourceOptions: string[];
}) {
  return (
    <div className="assist-task-filters assist-task-filters--header">
      <select className="assist-select" value={filters.due} onChange={(e) => onChange({ ...filters, due: e.target.value as TaskFilters['due'] })}>
        <option value="all">All due dates</option>
        <option value="overdue">Overdue</option>
        <option value="today">Due today</option>
        <option value="week">Due this week</option>
        <option value="none">No due date</option>
      </select>
      <select className="assist-select" value={filters.assignee} onChange={(e) => onChange({ ...filters, assignee: e.target.value })}>
        <option value="all">All assignees</option>
        <option value="mine">Assigned to me</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.id === currentUserId ? 'Me' : m.displayName}</option>
        ))}
      </select>
      <select className="assist-select" value={filters.priority} onChange={(e) => onChange({ ...filters, priority: e.target.value as TaskFilters['priority'] })}>
        <option value="all">All priorities</option>
        {(['urgent', 'high', 'normal', 'low'] as AssistantTaskPriority[]).map((p) => (
          <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
        ))}
      </select>
      <select className="assist-select" value={filters.source} onChange={(e) => onChange({ ...filters, source: e.target.value })}>
        {sourceOptions.map((s) => (
          <option key={s} value={s}>{s === 'all' ? 'All types' : SOURCE_LABEL[s] ?? s}</option>
        ))}
      </select>
    </div>
  );
}

type TaskContext = {
  sourceLookup: SourceMetaLookup;
  onOpenAction?: (action: { kind: AssistantActionKind; sourceId: string }) => void;
  onOpenCustomer?: (customerId: string) => void;
  onViewEmail?: (email: AssistantEmailItem) => void;
  onReplyEmail?: (email: AssistantEmailItem) => void;
  onPreviewTriaged?: (email: TriagedEmail) => void;
  onReplyTriaged?: (email: TriagedEmail) => void;
  onComposeEmail?: (to: string, subject: string, label?: string) => void;
  phoneForEmail?: (email?: string | null) => string;
  openCommsPane?: (tab: 'calls' | 'messages' | 'recaps' | 'recent') => void;
  scrollToSection?: (sectionId: string) => void;
};

export type AddTaskOptions = {
  priority?: AssistantTaskPriority;
  source?: string;
  key?: string;
  ownerIds?: string[];
  sourceMeta?: AssistantTaskSourceMeta | null;
  dueAt?: string | null;
  notesHtml?: string;
  openDetails?: boolean;
};

type Props = {
  tasks: AssistantTask[];
  members: TeamMember[];
  currentUserId: string;
  loading: boolean;
  newTaskPriority: AssistantTaskPriority;
  newTaskAssignees: Set<string>;
  focusDetailsTaskId?: string | null;
  onFocusDetailsHandled?: () => void;
  onToggleNewTaskAssignee: (id: string) => void;
  onNewTaskPriorityChange: (p: AssistantTaskPriority) => void;
  onAddTask: (title: string, opts?: AddTaskOptions) => Promise<AssistantTask[] | void>;
  onPatchTask: (id: string, patch: Parameters<typeof import('@/lib/assistant/types').updateAssistantTask>[1]) => void;
  onCompleteTask: (task: AssistantTask) => void;
  onRemoveTask: (id: string) => void;
  onAssignTask: (task: AssistantTask, ids: string[]) => void;
  taskContext: TaskContext;
  filters: TaskFilters;
  onFiltersChange: (next: TaskFilters) => void;
  addFormOpen: boolean;
  onAddFormClose: () => void;
};

function renderInline(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/@([a-z0-9._-]+)/gi, '<span class="assist-mention-tag">@$1</span>');
}

function AssigneePicker({
  ownerId,
  ownerName,
  members,
  currentUserId,
  onApply,
}: {
  ownerId: string;
  ownerName: string;
  members: TeamMember[];
  currentUserId: string;
  onApply: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set([ownerId]));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSel(new Set([ownerId]));
  }, [ownerId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const nameFor = (id: string) =>
    id === currentUserId ? 'Me' : members.find((m) => m.id === id)?.displayName ?? ownerName;
  const extra = sel.size - 1;
  const label = `${nameFor(ownerId)}${extra > 0 ? ` +${extra}` : ''}`;

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <div className="assist-assign" ref={ref}>
      <button
        type="button"
        className="assist-owner-select assist-assign-btn"
        onClick={() => setOpen((o) => !o)}
        title="Assign to one or more teammates"
      >
        <AppIcon name="specialist" size={11} /> {label}
        <span className="assist-assign-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="assist-assign-panel">
          <div className="assist-assign-head">Assign to</div>
          <div className="assist-assign-opts">
            {members.map((m) => (
              <label key={m.id} className="assist-assign-opt">
                <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
                <span>{m.id === currentUserId ? 'Me' : m.displayName}</span>
              </label>
            ))}
          </div>
          <div className="assist-assign-foot">
            <span className="assist-assign-hint">Extra picks get their own copy.</span>
            <button
              type="button"
              className="assist-mini-btn primary"
              onClick={() => {
                onApply([...sel]);
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
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

  const handles = members.slice(0, 4).map((m) => m.handle).join(' ');

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
          <span className="assist-thread-text" dangerouslySetInnerHTML={{ __html: renderInline(n.body) }} />
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

function TaskSourceActions({ task, ctx }: { task: AssistantTask; ctx: TaskContext }) {
  const meta = resolveTaskSourceMeta(task, ctx.sourceLookup);
  if (!meta) return null;
  const lookup = ctx.sourceLookup;
  const buttons: Array<{
    label: string;
    icon: 'email' | 'phone' | 'panelExpand' | 'alerts' | 'sparkles' | 'messages';
    primary?: boolean;
    onClick: () => void;
  }> = [];

  if (meta.refType === 'email' && meta.emailId) {
    const email = lookup.inboxById.get(meta.emailId);
    if (email) {
      buttons.push({ label: 'View email', icon: 'panelExpand', onClick: () => ctx.onViewEmail?.(email) });
      buttons.push({ label: 'Reply', icon: 'email', primary: true, onClick: () => ctx.onReplyEmail?.(email) });
    } else {
      const triaged = lookup.triagedById.get(meta.emailId);
      if (triaged) {
        buttons.push({ label: 'View email', icon: 'panelExpand', onClick: () => ctx.onPreviewTriaged?.(triaged) });
        buttons.push({ label: 'Reply', icon: 'email', primary: true, onClick: () => ctx.onReplyTriaged?.(triaged) });
      } else if (meta.contactEmail) {
        const subject = meta.subject ?? task.title;
        buttons.push({
          label: 'Reply',
          icon: 'email',
          primary: true,
          onClick: () =>
            ctx.onComposeEmail?.(
              meta.contactEmail!,
              /^re:/i.test(subject) ? subject : `Re: ${subject}`,
              meta.contactName ?? undefined,
            ),
        });
        buttons.push({ label: 'Open email tab', icon: 'email', onClick: () => ctx.scrollToSection?.('asec-email') });
      }
    }
  }

  if (meta.refType === 'action' && meta.refId) {
    const action = lookup.actionById.get(meta.refId);
    if (action?.ticketKind && ctx.onOpenAction) {
      buttons.push({
        label: 'Open action',
        icon: 'panelExpand',
        primary: true,
        onClick: () => ctx.onOpenAction!({ kind: action.kind, sourceId: action.sourceId }),
      });
    } else if (meta.sourceId && ctx.onOpenAction && meta.actionKind) {
      buttons.push({
        label: 'Open action',
        icon: 'panelExpand',
        onClick: () =>
          ctx.onOpenAction!({
            kind: meta.actionKind as AssistantActionKind,
            sourceId: meta.sourceId!,
          }),
      });
    }
  }

  if (meta.refType === 'call' && meta.refId) {
    const call = lookup.callById.get(meta.refId);
    if (call) {
      const ph = call.contactPhone || ctx.phoneForEmail?.(call.contactEmail);
      if (ph) {
        buttons.push({ label: 'Call', icon: 'phone', primary: true, onClick: () => { window.location.href = `tel:${ph}`; } });
      }
      if (call.contactEmail) {
        buttons.push({
          label: 'Email',
          icon: 'email',
          onClick: () => ctx.onComposeEmail?.(call.contactEmail!, 'Following up on our call', call.contactName ?? undefined),
        });
      }
      buttons.push({ label: 'View calls', icon: 'phone', onClick: () => ctx.openCommsPane?.('calls') });
    }
  }

  if (meta.refType === 'recap' && meta.refId) {
    const recap = lookup.recapById.get(meta.refId);
    if (recap?.recapUrl) {
      buttons.push({
        label: 'View recap',
        icon: 'sparkles',
        primary: true,
        onClick: () => window.open(recap.recapUrl!, '_blank', 'noopener,noreferrer'),
      });
    }
    if (meta.contactEmail) {
      buttons.push({
        label: 'Email',
        icon: 'email',
        onClick: () => ctx.onComposeEmail?.(meta.contactEmail!, meta.subject ?? task.title, meta.contactName ?? undefined),
      });
    }
    buttons.push({ label: 'View recaps', icon: 'sparkles', onClick: () => ctx.openCommsPane?.('recaps') });
  }

  if (meta.refType === 'mention') {
    buttons.push({
      label: 'View mention',
      icon: 'messages',
      primary: true,
      onClick: () => ctx.scrollToSection?.('asec-mentions'),
    });
  }

  const contactEmail = meta.contactEmail;
  const phone = meta.contactPhone || (contactEmail ? ctx.phoneForEmail?.(contactEmail) : '');
  if (contactEmail && !buttons.some((b) => b.label === 'Email' || b.label === 'Reply')) {
    buttons.push({
      label: 'Email',
      icon: 'email',
      onClick: () => ctx.onComposeEmail?.(contactEmail, meta.subject ?? task.title, meta.contactName ?? undefined),
    });
  }
  if (phone && !buttons.some((b) => b.label === 'Call')) {
    buttons.push({ label: 'Call', icon: 'phone', onClick: () => { window.location.href = `tel:${phone}`; } });
  }
  if (meta.customerId && ctx.onOpenCustomer) {
    buttons.push({
      label: 'Open account',
      icon: 'panelExpand',
      onClick: () => ctx.onOpenCustomer!(meta.customerId!),
    });
  }

  if (!buttons.length) return null;
  return (
    <div className="assist-task-source-actions">
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          className={`assist-mini-btn${b.primary ? ' primary' : ''}`}
          onClick={b.onClick}
        >
          <AppIcon name={b.icon} size={11} /> {b.label}
        </button>
      ))}
    </div>
  );
}

function ContactSlashPicker({
  command,
  onPick,
  onCancel,
}: {
  command: TaskSlashCommandId;
  onPick: (meta: AssistantTaskSourceMeta) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchPortalContacts>>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void searchPortalContacts(q.trim()).then(setResults);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const pick = async (email: string, name: string) => {
    setBusy(true);
    try {
      const detail = await fetchContactDetail(email);
      onPick({
        refType: command === 'customer' ? 'customer' : 'contact',
        contactEmail: email,
        contactName: name,
        contactPhone: detail.phone,
        customerId: detail.customerId,
      });
    } catch {
      onPick({ refType: 'contact', contactEmail: email, contactName: name });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="assist-task-slash-picker">
      <div className="assist-task-slash-head">
        {TASK_SLASH_COMMANDS.find((c) => c.id === command)?.label ?? 'Link contact'}
        <button type="button" className="assist-task-link" onClick={onCancel}>Cancel</button>
      </div>
      <input
        className="assist-task-input"
        placeholder="Search name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div className="assist-task-slash-results">
        {busy && <p className="assist-empty assist-empty--inline">Loading…</p>}
        {!busy && results.map((c) => (
          <button key={c.email} type="button" className="assist-task-slash-opt" onClick={() => void pick(c.email, c.name)}>
            <strong>{c.name}</strong>
            <span>{c.email}{c.org ? ` · ${c.org}` : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  members,
  currentUserId,
  openThreadId,
  editingDetails,
  notesExpanded,
  onComplete,
  onAssign,
  onRemove,
  onToggleThread,
  onPatch,
  onToggleDetails,
  onToggleNotes,
  taskContext,
}: {
  task: AssistantTask;
  members: TeamMember[];
  currentUserId: string;
  openThreadId: string | null;
  editingDetails: boolean;
  notesExpanded: boolean;
  onComplete: () => void;
  onAssign: (ids: string[]) => void;
  onRemove: () => void;
  onToggleThread: () => void;
  onPatch: Props['onPatchTask'];
  onToggleDetails: () => void;
  onToggleNotes: () => void;
  taskContext: TaskContext;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [notesHtml, setNotesHtml] = useState(task.notesHtml ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [dueLocal, setDueLocal] = useState(toDatetimeLocalValue(taskDueIso(task)));
  const [slashCmd, setSlashCmd] = useState<TaskSlashCommandId | null>(null);
  const [sourceMeta, setSourceMeta] = useState<AssistantTaskSourceMeta | null>(task.sourceMeta);

  useEffect(() => {
    setTitleDraft(task.title);
    setNotesHtml(task.notesHtml ?? '');
    setPriority(task.priority);
    setDueLocal(toDatetimeLocalValue(taskDueIso(task)));
    setSourceMeta(task.sourceMeta);
  }, [task]);

  const dueIso = taskDueIso(task);
  const overdue = isTaskOverdue(dueIso, task.status === 'done');
  const dueTone = taskDueTone(dueIso, task.status === 'done');
  const displayPriority = overdue && task.status !== 'done' ? 'urgent' : task.priority;
  const hasNotes = task.notesHtml && !isRichHtmlEmpty(task.notesHtml);
  const notesPreview = hasNotes ? richHtmlToPlainText(task.notesHtml!).slice(0, 140) : '';

  const saveDetails = () => {
    onPatch(task.id, {
      notesHtml: notesHtml.trim() || null,
      priority,
      dueAt: datetimeLocalToIso(dueLocal),
      sourceMeta,
    });
    onToggleDetails();
  };

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== task.title) onPatch(task.id, { title: t });
    setEditingTitle(false);
  };

  return (
    <div className={`assist-task${overdue ? ' assist-task--overdue' : ''}`}>
      <button type="button" className="assist-check" onClick={onComplete} aria-label="Mark done" />
      <div className="assist-task-body">
        {editingTitle ? (
          <input
            className="assist-task-input assist-task-title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') {
                setTitleDraft(task.title);
                setEditingTitle(false);
              }
            }}
            autoFocus
          />
        ) : (
          <button type="button" className="assist-task-title assist-task-title--editable" onClick={() => setEditingTitle(true)}>
            {task.title}
          </button>
        )}

        <div className="assist-task-meta">
          <span className={`assist-pri assist-pri--${displayPriority}`}>{PRIORITY_LABEL[displayPriority]}</span>
          {overdue && <span className="assist-task-overdue-tag">Overdue</span>}
          <span className="assist-task-type">{SOURCE_LABEL[task.source] ?? task.source}</span>
          <AssigneePicker
            ownerId={task.ownerId}
            ownerName={task.ownerName}
            members={members}
            currentUserId={currentUserId}
            onApply={onAssign}
          />
          {!task.mine && task.createdByName ? (
            <span className="assist-task-by">from {task.createdByName}</span>
          ) : null}
          {dueIso && (
            <span className={`assist-task-due assist-task-due--${dueTone}`}>
              Due {formatTaskDue(dueIso)}
              {task.originalDueAt && (
                <span className="assist-task-due-orig"> (was {formatTaskDue(task.originalDueAt)})</span>
              )}
            </span>
          )}
          <button type="button" className="assist-task-link" onClick={onToggleDetails}>
            {editingDetails ? 'Close' : hasNotes ? 'Edit details' : 'Add details'}
          </button>
          <button type="button" className="assist-task-link" onClick={onToggleThread}>
            <AppIcon name="messages" size={11} /> Discuss
          </button>
          <button type="button" className="assist-task-link assist-task-link--danger" onClick={onRemove}>
            Remove
          </button>
        </div>

        <TaskSourceActions task={{ ...task, sourceMeta }} ctx={taskContext} />

        {hasNotes && !editingDetails && (
          <button type="button" className="assist-task-notes-preview" onClick={onToggleNotes}>
            {notesExpanded ? (
              <div
                className="assist-task-notes-body"
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(task.notesHtml!) }}
              />
            ) : (
              <span>{notesPreview}{notesPreview.length >= 140 ? '…' : ''}</span>
            )}
          </button>
        )}

        {editingDetails && (
          <div className="assist-task-details-editor">
            <div className="assist-task-details-toolbar">
              <label className="assist-task-details-field">
                Priority
                <select
                  className="assist-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as AssistantTaskPriority)}
                >
                  {(['urgent', 'high', 'normal', 'low'] as AssistantTaskPriority[]).map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                  ))}
                </select>
              </label>
              <label className="assist-task-details-field">
                Due
                <input
                  type="datetime-local"
                  className="assist-task-input"
                  value={dueLocal}
                  onChange={(e) => setDueLocal(e.target.value)}
                />
              </label>
            </div>
            <div className="assist-task-shortcuts">
              <span className="assist-task-shortcuts-label">Shortcuts:</span>
              {TASK_SLASH_COMMANDS.map((c) => (
                <button key={c.id} type="button" className="assist-mini-btn" onClick={() => setSlashCmd(c.id)}>
                  {c.hint}
                </button>
              ))}
            </div>
            {slashCmd && (
              <ContactSlashPicker
                command={slashCmd}
                onPick={(meta) => {
                  setSourceMeta((prev) => ({ ...prev, ...meta }));
                  setSlashCmd(null);
                }}
                onCancel={() => setSlashCmd(null)}
              />
            )}
            <RichTextEditor
              key={task.id}
              initialValue={notesHtml}
              onChange={setNotesHtml}
              placeholder="Add notes, bullets, links… Type shortcuts above to link a contact."
              minHeight={120}
            />
            <div className="assist-task-details-actions">
              <button type="button" className="assist-mini-btn primary" onClick={saveDetails}>Save details</button>
            </div>
          </div>
        )}

        {openThreadId === task.id && <TaskThread taskId={task.id} members={members} />}
      </div>
    </div>
  );
}

function matchesDueFilter(dueIso: string | null, filter: TaskFilters['due']): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return !dueIso;
  if (!dueIso) return false;
  const d = new Date(dueIso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  if (filter === 'overdue') return d.getTime() < now.getTime();
  if (filter === 'today') {
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  }
  const week = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  return d.getTime() >= now.getTime() && d.getTime() <= week;
}

function filterTasks(tasks: AssistantTask[], filters: TaskFilters, currentUserId: string): AssistantTask[] {
  return tasks.filter((t) => {
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (filters.source !== 'all' && t.source !== filters.source) return false;
    if (filters.assignee === 'mine' && t.ownerId !== currentUserId) return false;
    if (filters.assignee !== 'all' && filters.assignee !== 'mine' && t.ownerId !== filters.assignee) return false;
    if (!matchesDueFilter(taskDueIso(t), filters.due)) return false;
    return true;
  });
}

export function AssistantTasksPanel({
  tasks,
  members,
  currentUserId,
  loading,
  newTaskPriority,
  newTaskAssignees,
  focusDetailsTaskId,
  onFocusDetailsHandled,
  onToggleNewTaskAssignee,
  onNewTaskPriorityChange,
  onAddTask,
  onPatchTask,
  onCompleteTask,
  onRemoveTask,
  onAssignTask,
  taskContext,
  filters,
  onFiltersChange,
  addFormOpen,
  onAddFormClose,
}: Props) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [detailsEditingId, setDetailsEditingId] = useState<string | null>(null);
  const [notesExpandedId, setNotesExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (focusDetailsTaskId) {
      setDetailsEditingId(focusDetailsTaskId);
      onFocusDetailsHandled?.();
    }
  }, [focusDetailsTaskId, onFocusDetailsHandled]);

  const visible = useMemo(
    () => filterTasks(tasks.filter((t) => t.status !== 'done'), filters, currentUserId),
    [tasks, filters, currentUserId],
  );
  const myTasks = visible.filter((t) => t.mine);
  const teamTasks = visible.filter((t) => !t.mine);

  const submitNew = useCallback(async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const created = await onAddTask(title, {
      priority: newTaskPriority,
      ownerIds: newTaskAssignees.size ? [...newTaskAssignees] : [currentUserId],
      dueAt: datetimeLocalToIso(newTaskDue),
      openDetails: true,
    });
    setNewTaskTitle('');
    setNewTaskDue('');
    onAddFormClose();
    const first = created?.[0];
    if (first) setDetailsEditingId(first.id);
  }, [newTaskTitle, newTaskPriority, newTaskAssignees, newTaskDue, currentUserId, onAddTask, onAddFormClose]);

  return (
    <>
      {addFormOpen && (
        <>
          <div className="assist-task-add">
            <input
              className="assist-task-input"
              placeholder="Add a task…"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNew();
                if (e.key === 'Escape') onAddFormClose();
              }}
              autoFocus
            />
            <input
              type="datetime-local"
              className="assist-task-due-input"
              value={newTaskDue}
              onChange={(e) => setNewTaskDue(e.target.value)}
              title="Due date (optional)"
            />
            <select
              className="assist-select"
              value={newTaskPriority}
              onChange={(e) => onNewTaskPriorityChange(e.target.value as AssistantTaskPriority)}
            >
              {(['urgent', 'high', 'normal', 'low'] as AssistantTaskPriority[]).map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
            <button type="button" className="assist-add-btn" onClick={() => void submitNew()}>
              <AppIcon name="add" size={12} /> Add
            </button>
            <button type="button" className="assist-mini-btn" onClick={onAddFormClose}>
              Cancel
            </button>
          </div>

          {members.length > 0 && (
            <div className="assist-task-assignees">
              <span className="assist-task-assignees-label">Assign to</span>
              <div className="assist-task-assignee-chips">
                {members.map((m) => {
                  const on = newTaskAssignees.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`assist-task-assignee-chip${on ? ' active' : ''}`}
                      onClick={() => onToggleNewTaskAssignee(m.id)}
                    >
                      {m.id === currentUserId ? 'Me' : m.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div className="assist-tasks-scroll">
        <div className="assist-task-section">
          <div className="assist-task-section-head">My tasks ({myTasks.length})</div>
          {myTasks.length === 0 && !loading && (
            <p className="assist-empty assist-empty--inline">No tasks match these filters.</p>
          )}
          {myTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              members={members}
              currentUserId={currentUserId}
              openThreadId={openThreadId}
              editingDetails={detailsEditingId === t.id}
              notesExpanded={notesExpandedId === t.id}
              onComplete={() => onCompleteTask(t)}
              onAssign={(ids) => onAssignTask(t, ids)}
              onRemove={() => onRemoveTask(t.id)}
              onToggleThread={() => setOpenThreadId(openThreadId === t.id ? null : t.id)}
              onPatch={onPatchTask}
              onToggleDetails={() => setDetailsEditingId(detailsEditingId === t.id ? null : t.id)}
              onToggleNotes={() => setNotesExpandedId(notesExpandedId === t.id ? null : t.id)}
              taskContext={taskContext}
            />
          ))}
        </div>

        <div className="assist-task-section">
          <div className="assist-task-section-head">Team tasks ({teamTasks.length})</div>
          {teamTasks.length === 0 && !loading && (
            <p className="assist-empty assist-empty--inline">No team tasks match these filters.</p>
          )}
          {teamTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              members={members}
              currentUserId={currentUserId}
              openThreadId={openThreadId}
              editingDetails={detailsEditingId === t.id}
              notesExpanded={notesExpandedId === t.id}
              onComplete={() => onCompleteTask(t)}
              onAssign={(ids) => onAssignTask(t, ids)}
              onRemove={() => onRemoveTask(t.id)}
              onToggleThread={() => setOpenThreadId(openThreadId === t.id ? null : t.id)}
              onPatch={onPatchTask}
              onToggleDetails={() => setDetailsEditingId(detailsEditingId === t.id ? null : t.id)}
              onToggleNotes={() => setNotesExpandedId(notesExpandedId === t.id ? null : t.id)}
              taskContext={taskContext}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default AssistantTasksPanel;
