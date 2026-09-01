'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CHANGE_APP_AREAS,
  CHANGE_FIELD_HINTS,
  CHANGE_PRIORITIES,
  CHANGE_SCREEN_PRESETS,
  CHANGE_TYPES,
  CHANGE_TYPE_LABEL,
  CHANGE_USER_ROLES,
  type ChangePriority,
  type ChangeRequest,
  type ChangeRequestInput,
  type ChangeType,
  type ChangeUserRole,
} from '@/lib/services/product-change-requests';

type AdminMember = { id: string; email: string; displayName: string };

type SpecDraft = {
  title: string;
  change_type: ChangeType;
  priority: ChangePriority;
  screen: string;
  screenCustom: boolean;
  user_role: ChangeUserRole;
  current_behavior: string;
  desired_behavior: string;
  user_flow_steps: string;
  change_solves: string;
  acceptance_criteria: string;
  out_of_scope: string;
  related_files: string;
  data_migration: 'none' | 'maybe' | 'yes';
  risk_notes: string;
  demo_impact: string;
  owner: string;
  reviewers: string[];
};

function FieldHint({ text }: { text: string }) {
  return <span className="roadmap-field-hint">{text}</span>;
}

function splitAppAreas(raw: string): { selected: string[]; custom: string } {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const presetSet = new Set<string>(CHANGE_APP_AREAS);
  const selected = parts.filter((p) => presetSet.has(p));
  const custom = parts.filter((p) => !presetSet.has(p)).join(', ');
  return { selected, custom };
}

function joinAppAreas(selected: string[], custom: string): string {
  const extras = custom
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...selected, ...extras].join(', ');
}

function changeToDraft(change: ChangeRequest): SpecDraft {
  const screenCustom = Boolean(
    change.screen && !(CHANGE_SCREEN_PRESETS as readonly string[]).includes(change.screen),
  );
  return {
    title: change.title,
    change_type: change.change_type,
    priority: change.priority,
    screen: change.screen,
    screenCustom,
    user_role: change.user_role,
    current_behavior: change.current_behavior,
    desired_behavior: change.desired_behavior,
    user_flow_steps: change.user_flow_steps,
    change_solves: change.change_solves,
    acceptance_criteria: change.acceptance_criteria,
    out_of_scope: change.out_of_scope,
    related_files: change.related_files,
    data_migration: change.data_migration,
    risk_notes: change.risk_notes,
    demo_impact: change.demo_impact,
    owner: change.owner,
    reviewers: change.reviewers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function draftToPatch(
  draft: SpecDraft,
  selectedAppAreas: string[],
  customAppAreas: string,
): ChangeRequestInput {
  return {
    title: draft.title.trim(),
    change_type: draft.change_type,
    priority: draft.priority,
    screen: draft.screen.trim(),
    user_role: draft.user_role,
    current_behavior: draft.current_behavior,
    desired_behavior: draft.desired_behavior,
    user_flow_steps: draft.user_flow_steps,
    change_solves: draft.change_solves,
    acceptance_criteria: draft.acceptance_criteria,
    out_of_scope: draft.out_of_scope,
    related_files: draft.related_files,
    data_migration: draft.data_migration,
    risk_notes: draft.risk_notes,
    demo_impact: draft.demo_impact,
    owner: draft.owner,
    reviewers: draft.reviewers.join(', '),
    app_areas: joinAppAreas(selectedAppAreas, customAppAreas),
  };
}

export function ChangeRequestSpecEditor({
  change,
  admins,
  saving,
  onSave,
  onCancel,
}: {
  change: ChangeRequest;
  admins: AdminMember[];
  saving: boolean;
  onSave: (patch: ChangeRequestInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<SpecDraft>(() => changeToDraft(change));
  const [selectedAppAreas, setSelectedAppAreas] = useState<string[]>([]);
  const [customAppAreas, setCustomAppAreas] = useState('');

  useEffect(() => {
    setDraft(changeToDraft(change));
    const { selected, custom } = splitAppAreas(change.app_areas);
    setSelectedAppAreas(selected);
    setCustomAppAreas(custom);
  }, [change.id, change.updated_at]);

  const dirty = useMemo(() => {
    const baseline = changeToDraft(change);
    const { selected, custom } = splitAppAreas(change.app_areas);
    if (joinAppAreas(selectedAppAreas, customAppAreas) !== change.app_areas) return true;
    return (Object.keys(baseline) as (keyof SpecDraft)[]).some((k) => {
      if (k === 'reviewers') {
        return draft.reviewers.join(',') !== baseline.reviewers.join(',');
      }
      return draft[k] !== baseline[k];
    });
  }, [change, draft, selectedAppAreas, customAppAreas]);

  const toggleAppArea = (area: string) => {
    setSelectedAppAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  const toggleReviewer = (email: string) => {
    setDraft((d) => ({
      ...d,
      reviewers: d.reviewers.includes(email)
        ? d.reviewers.filter((e) => e !== email)
        : [...d.reviewers, email],
    }));
  };

  const onDiscard = () => {
    setDraft(changeToDraft(change));
    const { selected, custom } = splitAppAreas(change.app_areas);
    setSelectedAppAreas(selected);
    setCustomAppAreas(custom);
    onCancel?.();
  };

  const onSubmit = async () => {
    if (!draft.title.trim()) return;
    await onSave(draftToPatch(draft, selectedAppAreas, customAppAreas));
  };

  return (
    <div className="roadmap-spec-editor">
      <div className="roadmap-spec-editor-actions">
        <button
          type="button"
          className="roadmap-btn"
          disabled={saving || !dirty || !draft.title.trim()}
          onClick={() => void onSubmit()}
        >
          {saving ? 'Saving…' : 'Save spec changes'}
        </button>
        <button
          type="button"
          className="roadmap-btn roadmap-btn--secondary"
          disabled={saving}
          onClick={onDiscard}
        >
          {dirty ? 'Discard' : 'Cancel'}
        </button>
        {dirty && <span className="roadmap-muted">Unsaved changes</span>}
      </div>

      <div className="roadmap-grid">
        <label className="roadmap-span-2">
          Title
          <FieldHint text={CHANGE_FIELD_HINTS.title} />
          <input
            className="roadmap-input"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
        </label>
        <label>
          Type
          <select
            className="roadmap-select"
            value={draft.change_type}
            onChange={(e) =>
              setDraft((d) => ({ ...d, change_type: e.target.value as ChangeType }))
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
            value={draft.priority}
            onChange={(e) =>
              setDraft((d) => ({ ...d, priority: e.target.value as ChangePriority }))
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
            value={draft.user_role}
            onChange={(e) =>
              setDraft((d) => ({ ...d, user_role: e.target.value as ChangeUserRole }))
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
            value={draft.data_migration}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
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
            value={draft.screenCustom ? '__custom__' : draft.screen}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__custom__') {
                setDraft((d) => ({ ...d, screenCustom: true, screen: '' }));
              } else {
                setDraft((d) => ({ ...d, screenCustom: false, screen: v }));
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
          {draft.screenCustom && (
            <input
              className="roadmap-input"
              style={{ marginTop: 6 }}
              value={draft.screen}
              onChange={(e) => setDraft((d) => ({ ...d, screen: e.target.value }))}
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
            value={draft.current_behavior}
            onChange={(e) => setDraft((d) => ({ ...d, current_behavior: e.target.value }))}
          />
        </label>
        <label className="roadmap-span-2">
          Desired behavior
          <FieldHint text={CHANGE_FIELD_HINTS.desired_behavior} />
          <textarea
            className="roadmap-textarea"
            rows={3}
            value={draft.desired_behavior}
            onChange={(e) => setDraft((d) => ({ ...d, desired_behavior: e.target.value }))}
          />
        </label>
        <label className="roadmap-span-2">
          User flow steps
          <FieldHint text={CHANGE_FIELD_HINTS.user_flow_steps} />
          <textarea
            className="roadmap-textarea"
            rows={3}
            value={draft.user_flow_steps}
            onChange={(e) => setDraft((d) => ({ ...d, user_flow_steps: e.target.value }))}
          />
        </label>
        <label className="roadmap-span-2">
          What does this change solve / fix?
          <FieldHint text={CHANGE_FIELD_HINTS.change_solves} />
          <textarea
            className="roadmap-textarea"
            rows={2}
            value={draft.change_solves}
            onChange={(e) => setDraft((d) => ({ ...d, change_solves: e.target.value }))}
          />
        </label>
        <label className="roadmap-span-2">
          Acceptance criteria
          <FieldHint text={CHANGE_FIELD_HINTS.acceptance_criteria} />
          <textarea
            className="roadmap-textarea"
            rows={3}
            value={draft.acceptance_criteria}
            onChange={(e) => setDraft((d) => ({ ...d, acceptance_criteria: e.target.value }))}
          />
        </label>
        <label className="roadmap-span-2">
          Out of scope
          <FieldHint text={CHANGE_FIELD_HINTS.out_of_scope} />
          <textarea
            className="roadmap-textarea"
            rows={2}
            value={draft.out_of_scope}
            onChange={(e) => setDraft((d) => ({ ...d, out_of_scope: e.target.value }))}
          />
        </label>
        <label className="roadmap-span-2">
          Related files (code)
          <FieldHint text={CHANGE_FIELD_HINTS.related_files} />
          <textarea
            className="roadmap-textarea"
            rows={2}
            value={draft.related_files}
            onChange={(e) => setDraft((d) => ({ ...d, related_files: e.target.value }))}
            placeholder="src/components/…"
          />
        </label>
        <label>
          Risk notes
          <FieldHint text={CHANGE_FIELD_HINTS.risk_notes} />
          <textarea
            className="roadmap-textarea"
            rows={2}
            value={draft.risk_notes}
            onChange={(e) => setDraft((d) => ({ ...d, risk_notes: e.target.value }))}
          />
        </label>
        <label>
          Demo impact
          <FieldHint text={CHANGE_FIELD_HINTS.demo_impact} />
          <textarea
            className="roadmap-textarea"
            rows={2}
            value={draft.demo_impact}
            onChange={(e) => setDraft((d) => ({ ...d, demo_impact: e.target.value }))}
          />
        </label>
        <label>
          Owner
          <FieldHint text={CHANGE_FIELD_HINTS.owner} />
          <select
            className="roadmap-select"
            value={draft.owner}
            onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
          >
            <option value="">Select admin…</option>
            {admins.map((a) => (
              <option key={a.id} value={a.displayName || a.email}>
                {a.displayName} ({a.email})
              </option>
            ))}
          </select>
        </label>
        <div className="roadmap-span-2">
          <div className="roadmap-field-label">Reviewers</div>
          <FieldHint text={CHANGE_FIELD_HINTS.reviewers} />
          <div className="roadmap-chip-grid">
            {admins.map((a) => {
              const on = draft.reviewers.includes(a.email);
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
          </div>
        </div>
      </div>
    </div>
  );
}
