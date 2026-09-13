'use client';

import { useState } from 'react';
import { callAdminHankAPI } from '@/lib/candid-data';
import {
  CHANGE_APP_AREAS,
  CHANGE_PRIORITIES,
  CHANGE_SCREEN_PRESETS,
  CHANGE_TYPES,
  CHANGE_TYPE_LABEL,
  CHANGE_PRIORITY_LABEL,
  type ChangePriority,
  type ChangeRequestInput,
  type ChangeType,
} from '@/lib/services/product-change-requests';

export type ChangeRequestFrankFields = Partial<
  Pick<
    ChangeRequestInput,
    | 'title'
    | 'change_type'
    | 'priority'
    | 'screen'
    | 'app_areas'
    | 'current_behavior'
    | 'desired_behavior'
    | 'user_flow_steps'
    | 'change_solves'
    | 'acceptance_criteria'
    | 'out_of_scope'
    | 'risk_notes'
    | 'demo_impact'
  >
>;

type Mode = 'review' | 'draft';

const FRANK_CR_SYSTEM_PROMPT = `You are Frank, helping Candid admins write Product roadmap change requests.

Your job is either:
1) REVIEW — critique an existing draft for clarity, wrong type, missing acceptance criteria, vague desired behavior, or dubious enhancement vs bug/new capability.
2) DRAFT — turn rough notes into a structured change-request field patch.

## Type guidance (use these exact change_type values)
- bug: something broken or wrong
- ui: visual/layout only
- flow: steps/workflow change
- feature: new capability users could not do before
- enhancement: improvement to something that already exists
- tech_debt: internal cleanup with no user-facing behavior change
- content: copy, docs, emails

## Priority values
p0, p1, p2, p3 (with meanings: critical, high, normal, low)

## Rules
- Respond with ONLY a single JSON object (no markdown fences unless needed; prefer raw JSON).
- Shape:
{
  "summary": "short plain-language notes for the author",
  "fields": { ...optional partial field patch... }
}
- fields keys may include: title, change_type, priority, screen, app_areas, current_behavior, desired_behavior, user_flow_steps, change_solves, acceptance_criteria, out_of_scope, risk_notes, demo_impact
- change_type must be one of: ${CHANGE_TYPES.join(', ')}
- priority must be one of: ${CHANGE_PRIORITIES.join(', ')}
- Prefer screen presets when possible: ${CHANGE_SCREEN_PRESETS.slice(0, 12).join('; ')}…
- Prefer app_areas as comma-separated list from: ${CHANGE_APP_AREAS.slice(0, 15).join('; ')}…
- Do not invent review acceptance — you only improve the written spec.
- In REVIEW mode, still return improved fields when wording is weak.
- In DRAFT mode, fill as many fields as you reasonably can from the notes.`;

function parseFrankJson(text: string): { summary: string; fields: ChangeRequestFrankFields } {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { summary: trimmed || 'Frank returned no structured suggestions.', fields: {} };
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: string;
      fields?: Record<string, unknown>;
    };
    const fields = sanitizeFields(parsed.fields ?? {});
    return {
      summary: String(parsed.summary ?? '').trim() || 'Suggestions ready — review before applying.',
      fields,
    };
  } catch {
    return { summary: trimmed || 'Could not parse Frank’s response.', fields: {} };
  }
}

function sanitizeFields(raw: Record<string, unknown>): ChangeRequestFrankFields {
  const out: ChangeRequestFrankFields = {};
  if (typeof raw.title === 'string' && raw.title.trim()) out.title = raw.title.trim();
  if (typeof raw.change_type === 'string' && (CHANGE_TYPES as readonly string[]).includes(raw.change_type)) {
    out.change_type = raw.change_type as ChangeType;
  }
  if (typeof raw.priority === 'string' && (CHANGE_PRIORITIES as readonly string[]).includes(raw.priority)) {
    out.priority = raw.priority as ChangePriority;
  }
  const stringKeys = [
    'screen',
    'app_areas',
    'current_behavior',
    'desired_behavior',
    'user_flow_steps',
    'change_solves',
    'acceptance_criteria',
    'out_of_scope',
    'risk_notes',
    'demo_impact',
  ] as const;
  for (const key of stringKeys) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }
  return out;
}

function fieldPreview(fields: ChangeRequestFrankFields): string[] {
  const lines: string[] = [];
  if (fields.title) lines.push(`Title: ${fields.title}`);
  if (fields.change_type) lines.push(`Type: ${CHANGE_TYPE_LABEL[fields.change_type]}`);
  if (fields.priority) lines.push(`Priority: ${CHANGE_PRIORITY_LABEL[fields.priority]}`);
  if (fields.screen) lines.push(`Primary screen: ${fields.screen}`);
  if (fields.app_areas) lines.push(`App areas: ${fields.app_areas}`);
  if (fields.change_solves) lines.push(`Solves: ${fields.change_solves.slice(0, 160)}`);
  if (fields.current_behavior) lines.push(`Current: ${fields.current_behavior.slice(0, 120)}…`);
  if (fields.desired_behavior) lines.push(`Desired: ${fields.desired_behavior.slice(0, 120)}…`);
  if (fields.acceptance_criteria) lines.push(`Acceptance criteria: updated`);
  if (fields.out_of_scope) lines.push(`Out of scope: updated`);
  return lines;
}

export function ChangeRequestFrankReview({
  current,
  onApply,
}: {
  current: ChangeRequestFrankFields;
  onApply: (patch: ChangeRequestFrankFields) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('draft');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');
  const [fields, setFields] = useState<ChangeRequestFrankFields>({});
  const [error, setError] = useState<string | null>(null);

  const askFrank = async () => {
    setBusy(true);
    setError(null);
    setSummary('');
    setFields({});
    try {
      const userPayload =
        mode === 'draft'
          ? `MODE: DRAFT\n\nAuthor notes:\n${notes.trim() || '(none — fill from any existing fields below)'}\n\nExisting draft (may be empty):\n${JSON.stringify(current, null, 2)}`
          : `MODE: REVIEW\n\nAuthor notes (optional):\n${notes.trim() || '(none)'}\n\nCurrent draft to critique/improve:\n${JSON.stringify(current, null, 2)}`;

      const text = await callAdminHankAPI([{ role: 'user', content: userPayload }], {
        systemPrompt: FRANK_CR_SYSTEM_PROMPT,
      });
      if (/credit balance|ANTHROPIC_API_KEY|API key|API error|empty response/i.test(text) && !text.includes('{')) {
        setError(text);
        return;
      }
      const parsed = parseFrankJson(text);
      setSummary(parsed.summary);
      setFields(parsed.fields);
      if (!Object.keys(parsed.fields).length && !parsed.summary) {
        setError('Frank returned an empty suggestion.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Frank Review failed');
    } finally {
      setBusy(false);
    }
  };

  const preview = fieldPreview(fields);

  return (
    <div className="roadmap-frank-review">
      {!open ? (
        <button type="button" className="roadmap-btn" onClick={() => setOpen(true)}>
          Frank Review
        </button>
      ) : (
        <div className="roadmap-frank-review-panel">
          <div className="roadmap-frank-review-head">
            <strong>Frank Review</strong>
            <button
              type="button"
              className="roadmap-btn roadmap-btn--secondary"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Close
            </button>
          </div>
          <div className="roadmap-frank-review-modes" role="tablist">
            <button
              type="button"
              className={`roadmap-chip${mode === 'draft' ? ' is-on' : ''}`}
              onClick={() => setMode('draft')}
              disabled={busy}
            >
              Help me draft
            </button>
            <button
              type="button"
              className={`roadmap-chip${mode === 'review' ? ' is-on' : ''}`}
              onClick={() => setMode('review')}
              disabled={busy}
            >
              Review this spec
            </button>
          </div>
          <p className="roadmap-field-hint">
            {mode === 'draft'
              ? 'Describe what you’re thinking or stuck on — Frank will draft structured change-request fields. Nothing is saved until you Apply.'
              : 'Frank critiques clarity, type/priority fit, and acceptance criteria, and can propose improved wording. Apply only what you want.'}
          </p>
          <textarea
            className="roadmap-textarea"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              mode === 'draft'
                ? 'e.g. On accounts documents I want a friendly name when uploading so members aren’t stuck with scanner filenames…'
                : 'Optional notes for Frank (e.g. “is this a bug or enhancement?”)'
            }
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" className="roadmap-btn" disabled={busy} onClick={() => void askFrank()}>
              {busy ? 'Asking Frank…' : mode === 'draft' ? 'Draft with Frank' : 'Ask Frank to review'}
            </button>
            {preview.length > 0 ? (
              <button
                type="button"
                className="roadmap-btn"
                disabled={busy}
                onClick={() => {
                  onApply(fields);
                  setOpen(false);
                }}
              >
                Apply suggestions
              </button>
            ) : null}
          </div>
          {error ? <div className="roadmap-banner roadmap-banner--error" style={{ marginTop: 10 }}>{error}</div> : null}
          {summary ? (
            <div className="roadmap-frank-review-summary">
              <div className="roadmap-field-label">Frank’s notes</div>
              <p>{summary}</p>
            </div>
          ) : null}
          {preview.length > 0 ? (
            <div className="roadmap-frank-review-summary">
              <div className="roadmap-field-label">Proposed field updates</div>
              <ul>
                {preview.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
