'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { TeamMember } from '@/lib/admin-action-work';
import { datetimeLocalToIso } from '@/lib/assistant/task-due';
import type { AssistantTaskPriority } from '@/lib/assistant/types';

const PRIORITY_LABEL: Record<AssistantTaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

type Props = {
  title: string;
  defaultPriority: AssistantTaskPriority;
  defaultAssignees: Set<string>;
  members: TeamMember[];
  currentUserId: string;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    priority: AssistantTaskPriority;
    dueAt: string | null;
    ownerIds: string[];
  }) => void | Promise<void>;
};

export function AddTaskModal({
  title: initialTitle,
  defaultPriority,
  defaultAssignees,
  members,
  currentUserId,
  onClose,
  onSubmit,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [priority, setPriority] = useState(defaultPriority);
  const [dueLocal, setDueLocal] = useState('');
  const [assignees, setAssignees] = useState<Set<string>>(() => new Set(defaultAssignees));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(initialTitle);
    setPriority(defaultPriority);
    setAssignees(new Set(defaultAssignees));
    setDueLocal('');
  }, [initialTitle, defaultPriority, defaultAssignees]);

  const toggleAssignee = (id: string) => {
    setAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        title: trimmed,
        priority,
        dueAt: datetimeLocalToIso(dueLocal),
        ownerIds: assignees.size ? [...assignees] : [currentUserId],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-add-task-modal" role="dialog" aria-label="Add task">
        <div className="assist-modal-head">
          <div className="assist-modal-title">Add task</div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body assist-form">
          <label className="assist-form-field">
            <span className="assist-form-label">Title</span>
            <input
              className="assist-task-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </label>
          <label className="assist-form-field">
            <span className="assist-form-label">Priority</span>
            <select
              className="assist-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as AssistantTaskPriority)}
            >
              {(['urgent', 'high', 'normal', 'low'] as AssistantTaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="assist-form-field">
            <span className="assist-form-label">Due date (optional)</span>
            <input
              type="datetime-local"
              className="assist-task-due-input"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
            />
          </label>
          {members.length > 0 && (
            <div className="assist-form-field">
              <span className="assist-form-label">Assign to</span>
              <div className="assist-task-assignee-chips">
                {members.map((m) => {
                  const on = assignees.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`assist-task-assignee-chip${on ? ' active' : ''}`}
                      onClick={() => toggleAssignee(m.id)}
                    >
                      {m.id === currentUserId ? 'Me' : m.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="assist-mini-btn primary"
            onClick={() => void submit()}
            disabled={saving || !title.trim()}
          >
            {saving ? 'Adding…' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  );
}
