'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChangeRequestSpecEditor } from '@/components/admin/ChangeRequestSpecEditor';
import { ChangeRequestSpecPanel } from '@/components/admin/ChangeRequestSpecPanel';
import { FileDropZone } from '@/components/admin/ChangeRequestFileDropZone';
import { formatTimelineItemLabel } from '@/lib/crm/change-roadmap-sync';
import { VERIFICATION_VERDICT_LABEL } from '@/lib/services/change-request-verification';
import {
  BLAST_RADII,
  BLAST_RADIUS_LABEL,
  CHANGE_APP_AREAS,
  CHANGE_DISPOSITIONS,
  CHANGE_FIELD_HINTS,
  CHANGE_PRIORITIES,
  CHANGE_SCREEN_PRESETS,
  CHANGE_STATUS_LABEL,
  CHANGE_STATUSES,
  CHANGE_TYPE_LABEL,
  CHANGE_TYPES,
  CHANGE_USER_ROLES,
  DISPOSITION_LABEL,
  IMPLEMENTATION_PATH_HINT,
  IMPLEMENTATION_PATH_LABEL,
  IMPLEMENTATION_PATHS,
  IMPLEMENTATION_PATHS_ON_CREATE,
  REVIEW_FIELD_HINTS,
  buildCursorPrompt,
  canSetReadyForPr,
  createChangeRequest,
  deleteChangeAttachment,
  fetchChangeAttachments,
  fetchChangeBoard,
  getReviewProgress,
  patchChangeRequest,
  runChangeVerification,
  submitChangeReview,
  uploadChangeAttachments,
  type BlastRadius,
  type ChangeAttachment,
  type ChangeDisposition,
  type ChangeEvent,
  type ChangePriority,
  type ChangeRequest,
  type ChangeReview,
  type ChangeRequestInput,
  type ChangeStatus,
  type ChangeVerificationResponse,
  type ChangeType,
  type ChangeUserRole,
  type CursorPromptAction,
  type ImplementationPath,
} from '@/lib/services/product-change-requests';
import {
  ROADMAP_KIND_LABEL,
  ROADMAP_STATUS_LABEL,
  ROADMAP_STATUSES,
  addRoadmapNote,
  createRoadmapItem,
  deleteRoadmapItem,
  fetchRoadmapBoard,
  patchRoadmapItem,
  type RoadmapEvent,
  type RoadmapItem,
  type RoadmapStatus,
} from '@/lib/services/product-roadmap';

type Tab = 'timeline' | 'changes' | 'history';
type AdminMember = { id: string; email: string; displayName: string };

const emptyChangeForm = {
  title: '',
  change_type: 'ui' as ChangeType,
  priority: 'p2' as ChangePriority,
  screen: '',
  screenCustom: false,
  user_role: 'both' as ChangeUserRole,
  current_behavior: '',
  desired_behavior: '',
  user_flow_steps: '',
  change_solves: '',
  acceptance_criteria: '',
  out_of_scope: '',
  related_files: '',
  data_migration: 'none' as 'none' | 'maybe' | 'yes',
  risk_notes: '',
  demo_impact: '',
  owner: '',
  reviewers: [] as string[],
  milestone_id: '' as string,
  implementation_path: 'spec_only' as ImplementationPath,
  linked_branch: '',
};

function FieldHint({ text }: { text: string }) {
  return <span className="roadmap-field-hint">{text}</span>;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function statusClass(status: string) {
  if (status === 'done' || status === 'accepted_ready') return 'roadmap-badge--ready';
  if (status.includes('accepted') || status === 'in_progress' || status === 'in_review')
    return 'roadmap-badge--active';
  if (status === 'blocked' || status === 'accepted_blocked' || status === 'rejected')
    return 'roadmap-badge--blocked';
  if (status === 'deferred' || status === 'cancelled' || status === 'changes_requested')
    return 'roadmap-badge--muted';
  return 'roadmap-badge--plain';
}

function joinAppAreas(selected: string[], custom: string) {
  const extras = custom
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...selected, ...extras].join(', ');
}

export function AdminRoadmapView() {
  const [tab, setTab] = useState<Tab>('timeline');
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [roadmapEvents, setRoadmapEvents] = useState<RoadmapEvent[]>([]);
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const [reviews, setReviews] = useState<ChangeReview[]>([]);
  const [changeEvents, setChangeEvents] = useState<ChangeEvent[]>([]);
  const [attachments, setAttachments] = useState<ChangeAttachment[]>([]);
  const [admins, setAdmins] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [showNewChange, setShowNewChange] = useState(false);
  const [form, setForm] = useState(emptyChangeForm);
  const [selectedAppAreas, setSelectedAppAreas] = useState<string[]>([]);
  const [customAppAreas, setCustomAppAreas] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [pathNote, setPathNote] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskParent, setNewTaskParent] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<ChangeVerificationResponse | null>(
    null,
  );
  const [editingSpec, setEditingSpec] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({
    disposition: 'accepted_ready' as ChangeDisposition,
    comment: '',
    risks: '',
    must_preserve: '',
    blast_radius: 'local' as BlastRadius,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [boardResult, changeBoardResult] = await Promise.allSettled([
        fetchRoadmapBoard(),
        fetchChangeBoard(),
      ]);

      if (boardResult.status === 'fulfilled') {
        const board = boardResult.value;
        if (board.migrationRequired) setMigrationRequired(true);
        if (board.error) setError(board.error);
        setItems(board.items);
        setRoadmapEvents(board.events);
      } else {
        setError('Failed to load roadmap timeline');
      }

      if (changeBoardResult.status === 'fulfilled') {
        const changeBoard = changeBoardResult.value;
        if (changeBoard.migrationRequired) setMigrationRequired(true);
        if (changeBoard.error) setError((e) => e || changeBoard.error || '');
        setChanges(changeBoard.changes);
        setReviews(changeBoard.reviews);
        setChangeEvents(changeBoard.events);
        setAttachments(changeBoard.attachments);
      } else {
        setError((e) => e || 'Failed to load change queue');
      }
    } catch {
      setError('Failed to load product roadmap');
    } finally {
      setLoading(false);
    }

    void fetch('/api/admin/team-members', { cache: 'no-store' })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.members) return;
        setAdmins(
          data.members as { id: string; email: string; displayName: string }[],
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVerificationResult(null);
    setEditingSpec(false);
  }, [selectedChangeId]);

  useEffect(() => {
    if (!selectedChangeId) return;
    let cancelled = false;
    void fetchChangeAttachments(selectedChangeId).then((withUrls) => {
      if (cancelled || !withUrls.length) return;
      setAttachments((prev) => {
        const others = prev.filter((a) => a.change_request_id !== selectedChangeId);
        const byId = new Map(withUrls.map((a) => [a.id, a]));
        const merged = prev
          .filter((a) => a.change_request_id === selectedChangeId)
          .map((a) => byId.get(a.id) ?? a);
        for (const a of withUrls) {
          if (!merged.some((m) => m.id === a.id)) merged.push(a);
        }
        return [...others, ...merged];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedChangeId]);

  const milestones = useMemo(
    () => items.filter((i) => i.kind === 'milestone').sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const objectives = useMemo(() => items.filter((i) => i.kind === 'objective'), [items]);
  const tasksByParent = useMemo(() => {
    const map = new Map<string, RoadmapItem[]>();
    for (const t of items.filter((i) => i.kind === 'task')) {
      const key = t.parent_id ?? '_';
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [items]);

  const selectedChange = useMemo(
    () => changes.find((c) => c.id === selectedChangeId) ?? null,
    [changes, selectedChangeId],
  );
  const selectedReviews = useMemo(
    () => reviews.filter((r) => r.change_request_id === selectedChangeId),
    [reviews, selectedChangeId],
  );
  const selectedAttachments = useMemo(
    () => attachments.filter((a) => a.change_request_id === selectedChangeId),
    [attachments, selectedChangeId],
  );
  const reviewProgress = useMemo(
    () =>
      selectedChange
        ? getReviewProgress(selectedChange.reviewers, selectedReviews)
        : { assigned: [], ready: [], pending: [] },
    [selectedChange, selectedReviews],
  );

  const timelineLinkOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [];
    for (const o of objectives) {
      opts.push({ id: o.id, label: formatTimelineItemLabel(o) });
    }
    for (const m of milestones) {
      opts.push({ id: m.id, label: formatTimelineItemLabel(m) });
      for (const t of tasksByParent.get(m.id) ?? []) {
        opts.push({ id: t.id, label: formatTimelineItemLabel(t, m) });
      }
    }
    return opts;
  }, [objectives, milestones, tasksByParent]);

  const changesByRoadmapItem = useMemo(() => {
    const map = new Map<string, ChangeRequest[]>();
    for (const c of changes) {
      if (!c.milestone_id) continue;
      const list = map.get(c.milestone_id) ?? [];
      list.push(c);
      map.set(c.milestone_id, list);
    }
    return map;
  }, [changes]);

  const linkedTimelineItem = useMemo(() => {
    if (!selectedChange?.milestone_id) return null;
    return items.find((i) => i.id === selectedChange.milestone_id) ?? null;
  }, [selectedChange, items]);

  const readyQueue = useMemo(
    () => changes.filter((c) => c.status === 'accepted_ready'),
    [changes],
  );

  const history = useMemo(() => {
    const rows: Array<{ id: string; at: string; kind: string; summary: string; actor: string }> = [];
    for (const e of roadmapEvents) {
      rows.push({
        id: `r-${e.id}`,
        at: e.created_at,
        kind: e.event_type,
        summary: e.summary,
        actor: e.actor_email ?? '—',
      });
    }
    for (const e of changeEvents) {
      rows.push({
        id: `c-${e.id}`,
        at: e.created_at,
        kind: e.event_type,
        summary: e.summary,
        actor: e.actor_email ?? '—',
      });
    }
    return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 120);
  }, [roadmapEvents, changeEvents]);

  const resetNewChangeForm = () => {
    setForm(emptyChangeForm);
    setSelectedAppAreas([]);
    setCustomAppAreas('');
    setPendingFiles([]);
  };

  const toggleAppArea = (area: string) => {
    setSelectedAppAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  const toggleReviewer = (email: string) => {
    setForm((f) => ({
      ...f,
      reviewers: f.reviewers.includes(email)
        ? f.reviewers.filter((e) => e !== email)
        : [...f.reviewers, email],
    }));
  };

  const copyCursorPrompt = async (action: CursorPromptAction) => {
    if (!selectedChange) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = buildCursorPrompt(selectedChange, action, origin);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(action);
      window.setTimeout(() => setCopiedPrompt(null), 2500);
    } catch {
      setError('Could not copy — select and copy from the prompt area');
    }
  };

  const onRunVerification = async () => {
    if (!selectedChangeId) return;
    setVerifying(true);
    setVerificationResult(null);
    setError('');
    try {
      const result = await runChangeVerification(selectedChangeId);
      if (result) {
        setVerificationResult(result);
        if (result.error) setError(result.error);
        await load();
      } else {
        setError('Verification failed');
      }
    } finally {
      setVerifying(false);
    }
  };

  const onApplySuggestedRelatedFiles = async () => {
    if (!selectedChange || !verificationResult?.suggestedRelatedFiles.length) return;
    setSaving(true);
    try {
      const merged = [
        ...selectedChange.related_files
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        ...verificationResult.suggestedRelatedFiles,
      ];
      const unique = [...new Set(merged)];
      await patchChangeRequest(selectedChange.id, { related_files: unique.join('\n') });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const onCreateChange = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const created = await createChangeRequest({
        title: form.title,
        change_type: form.change_type,
        priority: form.priority,
        screen: form.screen.trim(),
        user_role: form.user_role,
        current_behavior: form.current_behavior,
        desired_behavior: form.desired_behavior,
        user_flow_steps: form.user_flow_steps,
        change_solves: form.change_solves,
        acceptance_criteria: form.acceptance_criteria,
        out_of_scope: form.out_of_scope,
        app_areas: joinAppAreas(selectedAppAreas, customAppAreas),
        related_files: form.related_files,
        data_migration: form.data_migration,
        risk_notes: form.risk_notes,
        demo_impact: form.demo_impact,
        owner: form.owner,
        reviewers: form.reviewers.join(', '),
        milestone_id: form.milestone_id || null,
        implementation_path: form.implementation_path,
        linked_branch: form.linked_branch.trim(),
      });
      if (created) {
        if (pendingFiles.length) {
          await uploadChangeAttachments(created.id, pendingFiles);
        }
        setShowNewChange(false);
        resetNewChangeForm();
        setSelectedChangeId(created.id);
        setTab('changes');
        await load();
      } else {
        setError('Failed to create change request');
      }
    } finally {
      setSaving(false);
    }
  };

  const onAddDetailFiles = async (files: File[]) => {
    if (!selectedChangeId || !files.length) return;
    setSaving(true);
    try {
      await uploadChangeAttachments(selectedChangeId, files);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const onRemoveAttachment = async (attachmentId: string) => {
    if (!selectedChangeId) return;
    setSaving(true);
    try {
      await deleteChangeAttachment(selectedChangeId, attachmentId);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const onSubmitReview = async () => {
    if (!selectedChangeId) return;
    setSaving(true);
    try {
      const result = await submitChangeReview(selectedChangeId, reviewDraft);
      if (!result) {
        setError('Failed to submit review');
        return;
      }
      setReviewDraft({
        disposition: 'accepted_ready',
        comment: '',
        risks: '',
        must_preserve: '',
        blast_radius: 'local',
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const onAddPathNote = async () => {
    if (!pathNote.trim()) return;
    setSaving(true);
    try {
      await addRoadmapNote(pathNote.trim());
      setPathNote('');
      await load();
      setTab('history');
    } finally {
      setSaving(false);
    }
  };

  const onAddTask = async () => {
    if (!newTaskTitle.trim() || !newTaskParent) return;
    setSaving(true);
    try {
      await createRoadmapItem({
        kind: 'task',
        title: newTaskTitle.trim(),
        parent_id: newTaskParent,
        phase: items.find((i) => i.id === newTaskParent)?.phase ?? '',
        status: 'planned',
      });
      setNewTaskTitle('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="roadmap-page">
      <div className="roadmap-header">
        <div>
          <h1 className="roadmap-title">Product roadmap</h1>
          <p className="roadmap-sub">
            GTM timeline + change-control queue. Mark items <strong>Accepted — ready for Cursor</strong>, then
            run the <code>implement-accepted-change</code> skill manually.
          </p>
        </div>
        <div className="roadmap-tabs" role="tablist">
          {(
            [
              ['timeline', 'Timeline'],
              ['changes', `Change queue${readyQueue.length ? ` (${readyQueue.length} ready)` : ''}`],
              ['history', 'History'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`roadmap-tab${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {migrationRequired && (
        <div className="roadmap-banner">
          Database tables are missing. Apply migrations{' '}
          <code>product_roadmap</code> and <code>product_change_requests</code>, then refresh.
        </div>
      )}
      {error && <div className="roadmap-banner roadmap-banner--error">{error}</div>}
      {loading && <div className="roadmap-muted">Loading…</div>}

      {!loading && tab === 'timeline' && (
        <div className="roadmap-timeline">
          {objectives.map((obj) => (
            <div key={obj.id} className="roadmap-objective">
              <div className="roadmap-objective-top">
                <span className={`roadmap-badge ${statusClass(obj.status)}`}>
                  {ROADMAP_STATUS_LABEL[obj.status]}
                </span>
                <h2>{obj.title}</h2>
              </div>
              {obj.description && <p className="roadmap-desc">{obj.description}</p>}
              <div className="roadmap-meta">
                Owner {obj.owner || '—'} · Target {fmtDate(obj.target_date)}
              </div>
            </div>
          ))}

          {milestones.map((m) => {
            const tasks = tasksByParent.get(m.id) ?? [];
            const done = tasks.filter((t) => t.status === 'done').length;
            return (
              <section key={m.id} className="roadmap-milestone">
                <div className="roadmap-milestone-head">
                  <div>
                    <div className="roadmap-phase">{m.phase || ROADMAP_KIND_LABEL[m.kind]}</div>
                    <h3>{m.title}</h3>
                    {m.description && <p className="roadmap-desc">{m.description}</p>}
                    {(changesByRoadmapItem.get(m.id)?.length ?? 0) > 0 && (
                      <div className="roadmap-timeline-crs">
                        {changesByRoadmapItem.get(m.id)!.map((cr) => (
                          <button
                            key={cr.id}
                            type="button"
                            className="roadmap-timeline-cr-link"
                            onClick={() => {
                              setSelectedChangeId(cr.id);
                              setTab('changes');
                            }}
                          >
                            {cr.public_id} · {CHANGE_STATUS_LABEL[cr.status]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="roadmap-milestone-side">
                    <span className={`roadmap-badge ${statusClass(m.status)}`}>
                      {ROADMAP_STATUS_LABEL[m.status]}
                    </span>
                    <select
                      className="roadmap-select"
                      value={m.status}
                      onChange={(e) => {
                        void patchRoadmapItem(m.id, {
                          status: e.target.value as RoadmapStatus,
                        }).then(load);
                      }}
                    >
                      {ROADMAP_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {ROADMAP_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <div className="roadmap-muted">
                      {done}/{tasks.length} tasks · {fmtDate(m.target_date)}
                    </div>
                  </div>
                </div>
                <ul className="roadmap-task-list">
                  {tasks.map((t) => (
                    <li key={t.id} className="roadmap-task">
                      <div className="roadmap-task-main">
                        <span className={`roadmap-badge ${statusClass(t.status)}`}>
                          {ROADMAP_STATUS_LABEL[t.status]}
                        </span>
                        <div>
                          <div className="roadmap-task-title">{t.title}</div>
                          {(t.app_area || t.owner) && (
                            <div className="roadmap-muted">
                              {[t.app_area, t.owner].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {(changesByRoadmapItem.get(t.id)?.length ?? 0) > 0 && (
                            <div className="roadmap-timeline-crs">
                              {changesByRoadmapItem.get(t.id)!.map((cr) => (
                                <button
                                  key={cr.id}
                                  type="button"
                                  className="roadmap-timeline-cr-link"
                                  onClick={() => {
                                    setSelectedChangeId(cr.id);
                                    setTab('changes');
                                  }}
                                >
                                  {cr.public_id} · {CHANGE_STATUS_LABEL[cr.status]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="roadmap-task-actions">
                        <select
                          className="roadmap-select"
                          value={t.status}
                          onChange={(e) => {
                            void patchRoadmapItem(t.id, {
                              status: e.target.value as RoadmapStatus,
                            }).then(load);
                          }}
                        >
                          {ROADMAP_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {ROADMAP_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="roadmap-link-btn"
                          onClick={() => {
                            if (confirm(`Delete task “${t.title}”?`)) {
                              void deleteRoadmapItem(t.id).then(load);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="roadmap-card">
            <h4>Add task</h4>
            <div className="roadmap-form-row">
              <select
                className="roadmap-select"
                value={newTaskParent}
                onChange={(e) => setNewTaskParent(e.target.value)}
              >
                <option value="">Milestone…</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.phase || m.title}
                  </option>
                ))}
              </select>
              <input
                className="roadmap-input"
                placeholder="Task title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <button
                type="button"
                className="roadmap-btn"
                disabled={saving || !newTaskTitle.trim() || !newTaskParent}
                onClick={() => void onAddTask()}
              >
                Add
              </button>
            </div>
          </div>

          <div className="roadmap-card">
            <h4>Log a path change</h4>
            <textarea
              className="roadmap-textarea"
              rows={2}
              placeholder="What changed in direction, and why?"
              value={pathNote}
              onChange={(e) => setPathNote(e.target.value)}
            />
            <button
              type="button"
              className="roadmap-btn"
              disabled={saving || !pathNote.trim()}
              onClick={() => void onAddPathNote()}
            >
              Save to history
            </button>
          </div>
        </div>
      )}

      {!loading && tab === 'changes' && (
        <div className="roadmap-changes">
          <div className="roadmap-changes-toolbar">
            <button
              type="button"
              className="roadmap-btn"
              onClick={() => {
                if (!showNewChange) resetNewChangeForm();
                setShowNewChange((v) => !v);
              }}
            >
              {showNewChange ? 'Cancel' : 'New change request'}
            </button>
            {readyQueue.length > 0 && (
              <span className="roadmap-muted">
                {readyQueue.length} ready for Cursor — use skill{' '}
                <code>implement-accepted-change</code>
              </span>
            )}
          </div>

          {showNewChange && (
            <div className="roadmap-card roadmap-new-change">
              <h4>New change request</h4>
              <div className="roadmap-grid">
                <label className="roadmap-span-2">
                  Title
                  <FieldHint text={CHANGE_FIELD_HINTS.title} />
                  <input
                    className="roadmap-input"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Member can’t see published savings quote"
                  />
                </label>
                <label>
                  Type
                  <select
                    className="roadmap-select"
                    value={form.change_type}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, change_type: e.target.value as ChangeType }))
                    }
                  >
                    {CHANGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {CHANGE_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    className="roadmap-select"
                    value={form.priority}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, priority: e.target.value as ChangePriority }))
                    }
                  >
                    {CHANGE_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  User role
                  <select
                    className="roadmap-select"
                    value={form.user_role}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, user_role: e.target.value as ChangeUserRole }))
                    }
                  >
                    {CHANGE_USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Data migration
                  <select
                    className="roadmap-select"
                    value={form.data_migration}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        data_migration: e.target.value as 'none' | 'maybe' | 'yes',
                      }))
                    }
                  >
                    <option value="none">none</option>
                    <option value="maybe">maybe</option>
                    <option value="yes">yes</option>
                  </select>
                </label>
                <label className="roadmap-span-2">
                  Screen / route
                  <FieldHint text={CHANGE_FIELD_HINTS.screen} />
                  <select
                    className="roadmap-select"
                    value={form.screenCustom ? '__custom__' : form.screen}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__custom__') {
                        setForm((f) => ({ ...f, screenCustom: true, screen: '' }));
                      } else {
                        setForm((f) => ({ ...f, screenCustom: false, screen: v }));
                      }
                    }}
                  >
                    <option value="">Select…</option>
                    {CHANGE_SCREEN_PRESETS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="__custom__">Other (type your own)</option>
                  </select>
                  {form.screenCustom && (
                    <input
                      className="roadmap-input"
                      style={{ marginTop: 6 }}
                      value={form.screen}
                      onChange={(e) => setForm((f) => ({ ...f, screen: e.target.value }))}
                      placeholder="e.g. Member → Quotes & Proposals → quote detail"
                    />
                  )}
                </label>
                <div className="roadmap-span-2">
                  <div className="roadmap-field-label">App areas</div>
                  <FieldHint text={CHANGE_FIELD_HINTS.app_areas} />
                  <div className="roadmap-chip-grid">
                    {CHANGE_APP_AREAS.map((area) => {
                      const on = selectedAppAreas.includes(area);
                      return (
                        <button
                          key={area}
                          type="button"
                          className={`roadmap-chip${on ? ' is-on' : ''}`}
                          onClick={() => toggleAppArea(area)}
                        >
                          {area}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    className="roadmap-input"
                    style={{ marginTop: 8 }}
                    value={customAppAreas}
                    onChange={(e) => setCustomAppAreas(e.target.value)}
                    placeholder="Other areas (comma-separated)"
                  />
                </div>
                <label className="roadmap-span-2">
                  Current behavior
                  <FieldHint text={CHANGE_FIELD_HINTS.current_behavior} />
                  <textarea
                    className="roadmap-textarea"
                    rows={3}
                    value={form.current_behavior}
                    onChange={(e) => setForm((f) => ({ ...f, current_behavior: e.target.value }))}
                    placeholder="Today, when Bruce opens Quotes & Proposals, the published savings quote does not appear…"
                  />
                </label>
                <label className="roadmap-span-2">
                  Desired behavior
                  <FieldHint text={CHANGE_FIELD_HINTS.desired_behavior} />
                  <textarea
                    className="roadmap-textarea"
                    rows={3}
                    value={form.desired_behavior}
                    onChange={(e) => setForm((f) => ({ ...f, desired_behavior: e.target.value }))}
                    placeholder="After publish, every portal contact on the account sees the quote under Quotes & Proposals…"
                  />
                </label>
                <label className="roadmap-span-2">
                  User flow steps
                  <FieldHint text={CHANGE_FIELD_HINTS.user_flow_steps} />
                  <textarea
                    className="roadmap-textarea"
                    rows={3}
                    value={form.user_flow_steps}
                    onChange={(e) => setForm((f) => ({ ...f, user_flow_steps: e.target.value }))}
                    placeholder={'1. Admin publishes analysis\n2. Member opens Quotes & Proposals\n3. Member sees ready quote'}
                  />
                </label>
                <label className="roadmap-span-2">
                  What does this change solve / fix?
                  <FieldHint text={CHANGE_FIELD_HINTS.change_solves} />
                  <textarea
                    className="roadmap-textarea"
                    rows={2}
                    value={form.change_solves}
                    onChange={(e) => setForm((f) => ({ ...f, change_solves: e.target.value }))}
                    placeholder="Members can’t see published savings quotes — blocks beta demos and erodes trust in the portal."
                  />
                </label>
                <label className="roadmap-span-2">
                  Acceptance criteria
                  <FieldHint text={CHANGE_FIELD_HINTS.acceptance_criteria} />
                  <textarea
                    className="roadmap-textarea"
                    rows={3}
                    value={form.acceptance_criteria}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, acceptance_criteria: e.target.value }))
                    }
                    placeholder={'- Given a published savings quote for Wayne, when Bruce logs in, then it appears under Quotes & Proposals\n- Admin preview still works'}
                  />
                </label>
                <label>
                  Out of scope
                  <FieldHint text={CHANGE_FIELD_HINTS.out_of_scope} />
                  <textarea
                    className="roadmap-textarea"
                    rows={2}
                    value={form.out_of_scope}
                    onChange={(e) => setForm((f) => ({ ...f, out_of_scope: e.target.value }))}
                    placeholder="No redesign of Quotes page; no Plaid/Tech Spend changes"
                  />
                </label>
                <label>
                  Related files (code)
                  <FieldHint text={CHANGE_FIELD_HINTS.related_files} />
                  <textarea
                    className="roadmap-textarea"
                    rows={2}
                    value={form.related_files}
                    onChange={(e) => setForm((f) => ({ ...f, related_files: e.target.value }))}
                    placeholder="src/app/api/portal/account-services/route.ts"
                  />
                </label>
                <label>
                  Risk notes
                  <FieldHint text={CHANGE_FIELD_HINTS.risk_notes} />
                  <textarea
                    className="roadmap-textarea"
                    rows={2}
                    value={form.risk_notes}
                    onChange={(e) => setForm((f) => ({ ...f, risk_notes: e.target.value }))}
                    placeholder="Touches quote ownership — could hide quotes for other contacts if scoped wrong"
                  />
                </label>
                <label>
                  Demo impact
                  <FieldHint text={CHANGE_FIELD_HINTS.demo_impact} />
                  <textarea
                    className="roadmap-textarea"
                    rows={2}
                    value={form.demo_impact}
                    onChange={(e) => setForm((f) => ({ ...f, demo_impact: e.target.value }))}
                    placeholder="Blocks Wayne/Bruce savings demo until shipped"
                  />
                </label>
                <label>
                  Owner
                  <FieldHint text={CHANGE_FIELD_HINTS.owner} />
                  <select
                    className="roadmap-select"
                    value={form.owner}
                    onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                  >
                    <option value="">Select admin…</option>
                    {admins.map((a) => (
                      <option key={a.id} value={a.displayName || a.email}>
                        {a.displayName} ({a.email})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Timeline item
                  <FieldHint text={CHANGE_FIELD_HINTS.timeline_item} />
                  <select
                    className="roadmap-select"
                    value={form.milestone_id}
                    onChange={(e) => setForm((f) => ({ ...f, milestone_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {timelineLinkOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="roadmap-span-2">
                  <div className="roadmap-field-label">Reviewers</div>
                  <FieldHint text={CHANGE_FIELD_HINTS.reviewers} />
                  <div className="roadmap-chip-grid">
                    {admins.map((a) => {
                      const on = form.reviewers.includes(a.email);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className={`roadmap-chip${on ? ' is-on' : ''}`}
                          onClick={() => toggleReviewer(a.email)}
                        >
                          {a.displayName}
                        </button>
                      );
                    })}
                    {admins.length === 0 && (
                      <span className="roadmap-muted">No admins loaded.</span>
                    )}
                  </div>
                </div>
                <div className="roadmap-span-2">
                  <div className="roadmap-field-label">UI screenshots</div>
                  <FieldHint text={CHANGE_FIELD_HINTS.screenshots} />
                  <FileDropZone
                    accept="image/*,application/pdf"
                    disabled={saving}
                    label="Drop screenshots or PDFs here (multiple allowed)"
                    onFiles={(files) =>
                      setPendingFiles((prev) => [...prev, ...files].slice(0, 12))
                    }
                  />
                  {pendingFiles.length > 0 && (
                    <ul className="roadmap-file-list">
                      {pendingFiles.map((f, i) => (
                        <li key={`${f.name}-${i}`}>
                          <span>{f.name}</span>
                          <button
                            type="button"
                            className="roadmap-link-btn"
                            onClick={() =>
                              setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <label>
                Where are you in this change?
                <FieldHint text={IMPLEMENTATION_PATH_HINT} />
                <select
                  className="roadmap-select"
                  value={form.implementation_path}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      implementation_path: e.target.value as ImplementationPath,
                    }))
                  }
                >
                  {IMPLEMENTATION_PATHS_ON_CREATE.map((p) => (
                    <option key={p} value={p}>
                      {IMPLEMENTATION_PATH_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Git branch (optional)
                <FieldHint text="If you already have local changes, paste the branch name so Cursor can verify against it." />
                <input
                  className="roadmap-input"
                  value={form.linked_branch}
                  onChange={(e) => setForm((f) => ({ ...f, linked_branch: e.target.value }))}
                  placeholder="feat/my-change"
                />
              </label>
              <button
                type="button"
                className="roadmap-btn"
                disabled={saving || !form.title.trim()}
                onClick={() => void onCreateChange()}
              >
                {saving ? 'Saving…' : 'Create'}
              </button>
            </div>
          )}

          <div className="roadmap-changes-layout">
            <div className="roadmap-change-list">
              {changes.length === 0 && (
                <div className="roadmap-muted">No change requests yet.</div>
              )}
              {changes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`roadmap-change-row${selectedChangeId === c.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedChangeId(c.id)}
                >
                  <div className="roadmap-change-row-top">
                    <code>{c.public_id}</code>
                    <span className={`roadmap-badge ${statusClass(c.status)}`}>
                      {CHANGE_STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <div className="roadmap-change-row-title">{c.title}</div>
                  <div className="roadmap-muted">
                    {CHANGE_TYPE_LABEL[c.change_type]} · {c.priority.toUpperCase()}
                    {c.screen ? ` · ${c.screen}` : ''}
                    {c.milestone_id && (
                      <>
                        {' '}
                        ·{' '}
                        {timelineLinkOptions.find((o) => o.id === c.milestone_id)?.label ?? 'Timeline'}
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="roadmap-change-detail">
              {!selectedChange && (
                <div className="roadmap-muted">Select a change request to review.</div>
              )}
              {selectedChange && (
                <>
                  <div className="roadmap-change-detail-head">
                    <div>
                      <code>{selectedChange.public_id}</code>
                      <h3>{selectedChange.title}</h3>
                    </div>
                    <select
                      className="roadmap-select"
                      value={selectedChange.status}
                      onChange={(e) => {
                        void patchChangeRequest(selectedChange.id, {
                          status: e.target.value as ChangeStatus,
                        }).then(load);
                      }}
                    >
                      {CHANGE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {CHANGE_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="roadmap-detail-scroll">
                    <section className="roadmap-detail-block">
                      <div className="roadmap-detail-block-head">
                        <h4 className="roadmap-detail-block-title">Specification</h4>
                        {!editingSpec ? (
                          <button
                            type="button"
                            className="roadmap-icon-btn"
                            title="Edit specification"
                            aria-label="Edit specification"
                            onClick={() => setEditingSpec(true)}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="roadmap-link-btn"
                            disabled={saving}
                            onClick={() => setEditingSpec(false)}
                          >
                            Cancel edit
                          </button>
                        )}
                      </div>
                      {editingSpec ? (
                        <ChangeRequestSpecEditor
                          change={selectedChange}
                          admins={admins}
                          saving={saving}
                          onCancel={() => setEditingSpec(false)}
                          onSave={async (patch: ChangeRequestInput) => {
                            setSaving(true);
                            try {
                              const updated = await patchChangeRequest(selectedChange.id, patch);
                              if (!updated) {
                                setError('Failed to save spec');
                                return;
                              }
                              setEditingSpec(false);
                              await load();
                            } finally {
                              setSaving(false);
                            }
                          }}
                        />
                      ) : (
                        <ChangeRequestSpecPanel change={selectedChange} />
                      )}
                    </section>

                    <section className="roadmap-detail-block">
                      <h4 className="roadmap-detail-block-title">Timeline</h4>
                      <FieldHint text={CHANGE_FIELD_HINTS.timeline_item} />
                      <label style={{ display: 'block', marginTop: 8 }}>
                        Linked timeline item
                        <select
                          className="roadmap-select"
                          style={{ marginTop: 6, width: '100%' }}
                          value={selectedChange.milestone_id ?? ''}
                          onChange={(e) => {
                            void patchChangeRequest(selectedChange.id, {
                              milestone_id: e.target.value || null,
                            }).then(load);
                          }}
                        >
                          <option value="">None</option>
                          {timelineLinkOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {linkedTimelineItem && (
                        <div className="roadmap-banner" style={{ marginTop: 10 }}>
                          Timeline status:{' '}
                          <strong>{ROADMAP_STATUS_LABEL[linkedTimelineItem.status]}</strong>
                          {' · '}
                          Marks <strong>Done</strong> on the timeline when this change is{' '}
                          <strong>Done</strong>.
                          <button
                            type="button"
                            className="roadmap-link-btn"
                            style={{ marginLeft: 8 }}
                            onClick={() => setTab('timeline')}
                          >
                            View timeline
                          </button>
                        </div>
                      )}
                    </section>

                    <section className="roadmap-detail-block">
                      <h4 className="roadmap-detail-block-title">Attachments</h4>
                      <FieldHint text={CHANGE_FIELD_HINTS.screenshots} />
                      {selectedAttachments.length === 0 && (
                        <div className="roadmap-muted" style={{ marginTop: 8 }}>
                          No screenshots yet.
                        </div>
                      )}
                      <div className="roadmap-attach-grid">
                        {selectedAttachments.map((a) => (
                          <div key={a.id} className="roadmap-attach-item">
                            {a.url && a.content_type.startsWith('image/') ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <a href={a.url} target="_blank" rel="noreferrer">
                                <img src={a.url} alt={a.file_name} />
                              </a>
                            ) : (
                              <a href={a.url ?? '#'} target="_blank" rel="noreferrer">
                                {a.file_name}
                              </a>
                            )}
                            <div className="roadmap-attach-meta">
                              <span>{a.file_name}</span>
                              <button
                                type="button"
                                className="roadmap-link-btn"
                                disabled={saving}
                                onClick={() => void onRemoveAttachment(a.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <FileDropZone
                        accept="image/*,application/pdf"
                        disabled={saving}
                        label="Drop more screenshots or PDFs"
                        onFiles={(files) => void onAddDetailFiles(files)}
                      />
                    </section>

                    <section className="roadmap-detail-block roadmap-detail-block--last">
                      <h4 className="roadmap-detail-block-title">Implementation</h4>
                      <p className="roadmap-muted" style={{ marginBottom: 10 }}>
                        Copy a Cursor prompt for Agent mode.{' '}
                        <a href="/admin#roadmap">Change queue</a>
                      </p>
                      <div className="roadmap-grid">
                        <label>
                          Implementation path
                          <FieldHint text={IMPLEMENTATION_PATH_HINT} />
                          <select
                            className="roadmap-select"
                            value={selectedChange.implementation_path}
                            onChange={(e) => {
                              const path = e.target.value as ImplementationPath;
                              void patchChangeRequest(selectedChange.id, {
                                implementation_path: path,
                              }).then(load);
                            }}
                          >
                            {IMPLEMENTATION_PATHS.map((p) => (
                              <option
                                key={p}
                                value={p}
                                disabled={
                                  p === 'ready_for_pr' && !canSetReadyForPr(selectedChange.status)
                                }
                              >
                                {IMPLEMENTATION_PATH_LABEL[p]}
                                {p === 'ready_for_pr' && !canSetReadyForPr(selectedChange.status)
                                  ? ' (requires acceptance)'
                                  : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Linked branch
                          <input
                            className="roadmap-input"
                            defaultValue={selectedChange.linked_branch}
                            placeholder="feat/CR-xxxx-slug"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v === selectedChange.linked_branch) return;
                              void patchChangeRequest(selectedChange.id, { linked_branch: v }).then(
                                load,
                              );
                            }}
                          />
                        </label>
                        <label>
                          Pull request URL
                          <input
                            className="roadmap-input"
                            defaultValue={selectedChange.linked_pr_url}
                            placeholder="https://github.com/…/pull/…"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v === selectedChange.linked_pr_url) return;
                              void patchChangeRequest(selectedChange.id, { linked_pr_url: v }).then(
                                load,
                              );
                            }}
                          />
                        </label>
                      </div>
                      <div className="roadmap-verify-bar">
                        <button
                          type="button"
                          className="roadmap-btn"
                          disabled={verifying || saving}
                          onClick={() => void onRunVerification()}
                        >
                          {verifying ? 'Running…' : 'Run verification'}
                        </button>
                        <span className="roadmap-muted">
                          Compares local git diff to this spec (dev machine only).
                        </span>
                      </div>
                      {(verificationResult || selectedChange.last_verification_summary) && (
                        <div
                          className={`roadmap-subcard roadmap-verify-result${
                            verificationResult
                              ? ` roadmap-verify-result--${verificationResult.verdict}`
                              : ''
                          }`}
                        >
                          <div className="roadmap-subcard-title">
                            {verificationResult ? (
                              <>
                                Verification:{' '}
                                <span className={`roadmap-badge roadmap-verify-badge--${verificationResult.verdict}`}>
                                  {VERIFICATION_VERDICT_LABEL[verificationResult.verdict]}
                                </span>
                              </>
                            ) : (
                              <>Last verification</>
                            )}
                            {selectedChange.last_verification_at && !verificationResult && (
                              <span className="roadmap-muted">
                                {' '}
                                · {fmtDate(selectedChange.last_verification_at)}
                              </span>
                            )}
                          </div>
                          {verificationResult && verificationResult.checks.length > 0 && (
                            <ul className="roadmap-verify-checks">
                              {verificationResult.checks.map((c) => (
                                <li
                                  key={c.name}
                                  className={`roadmap-verify-check roadmap-verify-check--${c.status}`}
                                >
                                  <strong>{c.name}</strong> — {c.detail}
                                </li>
                              ))}
                            </ul>
                          )}
                          <pre className="roadmap-spec-pre">
                            {verificationResult?.summary ?? selectedChange.last_verification_summary}
                          </pre>
                          {verificationResult &&
                            verificationResult.suggestedRelatedFiles.length > 0 &&
                            verificationResult.verdict !== 'aligned' && (
                              <button
                                type="button"
                                className="roadmap-btn roadmap-btn--secondary"
                                style={{ marginTop: 8 }}
                                disabled={saving}
                                onClick={() => void onApplySuggestedRelatedFiles()}
                              >
                                Add changed files to related files list
                              </button>
                            )}
                        </div>
                      )}
                      <div className="roadmap-prompt-actions">
                        <button
                          type="button"
                          className="roadmap-btn roadmap-btn--secondary"
                          onClick={() => void copyCursorPrompt('file_from_diff')}
                        >
                          {copiedPrompt === 'file_from_diff' ? 'Copied!' : 'Copy: file from local diff'}
                        </button>
                        <button
                          type="button"
                          className="roadmap-btn roadmap-btn--secondary"
                          onClick={() => void copyCursorPrompt('verify')}
                        >
                          {copiedPrompt === 'verify' ? 'Copied!' : 'Copy: verify local vs spec'}
                        </button>
                        <button
                          type="button"
                          className="roadmap-btn roadmap-btn--secondary"
                          disabled={selectedChange.status !== 'accepted_ready'}
                          title={
                            selectedChange.status !== 'accepted_ready'
                              ? 'Requires accepted_ready status'
                              : undefined
                          }
                          onClick={() => void copyCursorPrompt('implement')}
                        >
                          {copiedPrompt === 'implement' ? 'Copied!' : 'Copy: implement in Cursor'}
                        </button>
                        <button
                          type="button"
                          className="roadmap-btn"
                          disabled={!canSetReadyForPr(selectedChange.status)}
                          title={
                            !canSetReadyForPr(selectedChange.status)
                              ? 'Requires accepted_ready or in_progress'
                              : undefined
                          }
                          onClick={() => void copyCursorPrompt('push_pr')}
                        >
                          {copiedPrompt === 'push_pr' ? 'Copied!' : 'Copy: verify & open PR'}
                        </button>
                      </div>
                    </section>
                  </div>

                  <div className="roadmap-review-zone">
                    <div className="roadmap-review-zone-head">
                      <div>
                        <h4>Team review</h4>
                        <p className="roadmap-muted" style={{ margin: '4px 0 0' }}>
                          Reviewers submit dispositions here — separate from the spec above.
                        </p>
                      </div>
                      {reviewProgress.assigned.length > 0 && selectedChange.status === 'in_review' && (
                        <div className="roadmap-review-progress">
                          {reviewProgress.ready.length}/{reviewProgress.assigned.length} ready
                        </div>
                      )}
                    </div>

                    {reviewProgress.assigned.length > 0 && selectedChange.status === 'in_review' && (
                      <div className="roadmap-banner roadmap-banner--compact">
                        {reviewProgress.pending.length > 0 ? (
                          <>Waiting on: {reviewProgress.pending.join(', ')}</>
                        ) : (
                          <>All assigned reviewers have accepted.</>
                        )}
                      </div>
                    )}

                    {selectedReviews.length > 0 && (
                      <div className="roadmap-review-history">
                        <div className="roadmap-subcard-title">Previous dispositions</div>
                        {selectedReviews.map((r) => (
                          <div key={r.id} className="roadmap-review-item">
                            <div className="roadmap-change-row-top">
                              <strong>{r.reviewer_email}</strong>
                              <span className={`roadmap-badge ${statusClass(r.disposition)}`}>
                                {DISPOSITION_LABEL[r.disposition]}
                              </span>
                            </div>
                            {r.comment && <p>{r.comment}</p>}
                            {(r.risks || r.must_preserve) && (
                              <div className="roadmap-muted">
                                {r.risks && <>Risks: {r.risks}. </>}
                                {r.must_preserve && <>Preserve: {r.must_preserve}</>}
                              </div>
                            )}
                            <div className="roadmap-muted">
                              Blast radius: {BLAST_RADIUS_LABEL[r.blast_radius]}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!['done', 'rejected'].includes(selectedChange.status) && (
                      <div className="roadmap-review-form">
                        <p className="roadmap-muted" style={{ marginBottom: 10 }}>
                          All assigned reviewers must choose{' '}
                          <strong>Accept & ready for Cursor</strong>. Reject or request changes to
                          block implementation.
                        </p>
                        <div className="roadmap-grid">
                          <label>
                            Disposition
                            <FieldHint text={REVIEW_FIELD_HINTS.disposition} />
                            <select
                              className="roadmap-select"
                              value={reviewDraft.disposition}
                              onChange={(e) =>
                                setReviewDraft((d) => ({
                                  ...d,
                                  disposition: e.target.value as ChangeDisposition,
                                }))
                              }
                            >
                              {CHANGE_DISPOSITIONS.map((d) => (
                                <option key={d} value={d}>
                                  {DISPOSITION_LABEL[d]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Blast radius
                            <FieldHint text={REVIEW_FIELD_HINTS.blast_radius} />
                            <select
                              className="roadmap-select"
                              value={reviewDraft.blast_radius}
                              onChange={(e) =>
                                setReviewDraft((d) => ({
                                  ...d,
                                  blast_radius: e.target.value as BlastRadius,
                                }))
                              }
                            >
                              {BLAST_RADII.map((b) => (
                                <option key={b} value={b}>
                                  {BLAST_RADIUS_LABEL[b]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="roadmap-span-2">
                            Comment
                            <FieldHint text={REVIEW_FIELD_HINTS.comment} />
                            <textarea
                              className="roadmap-textarea"
                              rows={2}
                              value={reviewDraft.comment}
                              onChange={(e) =>
                                setReviewDraft((d) => ({ ...d, comment: e.target.value }))
                              }
                              placeholder="Spec is clear; add acceptance criterion for empty state…"
                            />
                          </label>
                          <label>
                            Risks
                            <FieldHint text={REVIEW_FIELD_HINTS.risks} />
                            <textarea
                              className="roadmap-textarea"
                              rows={2}
                              value={reviewDraft.risks}
                              onChange={(e) =>
                                setReviewDraft((d) => ({ ...d, risks: e.target.value }))
                              }
                              placeholder="Could hide quotes for other contacts if scoped by user_id only…"
                            />
                          </label>
                          <label>
                            Must preserve
                            <FieldHint text={REVIEW_FIELD_HINTS.must_preserve} />
                            <textarea
                              className="roadmap-textarea"
                              rows={2}
                              value={reviewDraft.must_preserve}
                              onChange={(e) =>
                                setReviewDraft((d) => ({ ...d, must_preserve: e.target.value }))
                              }
                              placeholder="Admin preview and existing published quotes must still work…"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="roadmap-btn"
                          disabled={saving}
                          onClick={() => void onSubmitReview()}
                          style={{ marginTop: 10 }}
                        >
                          Submit disposition
                        </button>
                      </div>
                    )}

                    {['done', 'rejected'].includes(selectedChange.status) && (
                      <p className="roadmap-muted" style={{ margin: 0 }}>
                        Review closed — change is {CHANGE_STATUS_LABEL[selectedChange.status]}.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'history' && (
        <div className="roadmap-history">
          {history.length === 0 && <div className="roadmap-muted">No history yet.</div>}
          <ul className="roadmap-history-list">
            {history.map((h) => (
              <li key={h.id}>
                <div className="roadmap-history-meta">
                  <span className="roadmap-badge roadmap-badge--plain">{h.kind}</span>
                  <span>{fmtDate(h.at)}</span>
                  <span className="roadmap-muted">{h.actor}</span>
                </div>
                <div>{h.summary}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
