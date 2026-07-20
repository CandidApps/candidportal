'use client';

import { useMemo, useState } from 'react';
import { normalizeOutreachTagName } from '@/lib/outreach';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: Array<{ name: string; accountCount?: number }>;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
};

/**
 * Free-text multi-tag input with typeahead against existing outreach tags.
 * Enter / comma / Add creates a new tag name if it does not already exist.
 */
export function OutreachTagInput({
  value,
  onChange,
  suggestions,
  disabled = false,
  placeholder = 'Type a tag and press Enter',
  label = 'Tags',
}: Props) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const selected = value;
  const selectedLower = useMemo(
    () => new Set(selected.map((t) => t.toLowerCase())),
    [selected],
  );

  const q = draft.trim().toLowerCase();
  const matches = useMemo(() => {
    return suggestions
      .filter((s) => !selectedLower.has(s.name.toLowerCase()))
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [suggestions, selectedLower, q]);

  const exactExists = suggestions.some((s) => s.name.toLowerCase() === q);
  const canCreate = Boolean(q) && !exactExists && !selectedLower.has(q);

  const add = (raw: string) => {
    const tag = normalizeOutreachTagName(raw);
    if (!tag || disabled) return;
    if (selectedLower.has(tag.toLowerCase())) {
      setDraft('');
      setOpen(false);
      return;
    }
    // Prefer canonical casing from an existing suggestion when present.
    const known = suggestions.find((s) => s.name.toLowerCase() === tag.toLowerCase());
    onChange([...selected, known?.name ?? tag]);
    setDraft('');
    setOpen(false);
  };

  const remove = (tag: string) => {
    if (disabled) return;
    onChange(selected.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
  };

  return (
    <div className="outreach-tag-input">
      {label ? <div className="outreach-tag-input-label">{label}</div> : null}
      {selected.length > 0 ? (
        <div className="outreach-tag-chips">
          {selected.map((tag) => (
            <button
              key={tag}
              type="button"
              className="outreach-tag-chip"
              disabled={disabled}
              onClick={() => remove(tag)}
              title="Remove tag"
            >
              {tag} ×
            </button>
          ))}
        </div>
      ) : null}
      <div className="outreach-tag-input-row">
        <input
          className="outreach-input"
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Allow click on suggestion before closing.
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && selected.length) {
              remove(selected[selected.length - 1]!);
            }
          }}
        />
        <button
          type="button"
          className="admin-ticket-btn"
          disabled={disabled || !draft.trim()}
          onClick={() => add(draft)}
        >
          Add
        </button>
      </div>
      {open && (matches.length > 0 || canCreate) ? (
        <div className="outreach-tag-suggest" role="listbox">
          {matches.map((s) => (
            <button
              key={s.name}
              type="button"
              role="option"
              className="outreach-tag-suggest-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(s.name)}
            >
              <span>{s.name}</span>
              {typeof s.accountCount === 'number' ? (
                <span className="outreach-muted">{s.accountCount}</span>
              ) : null}
            </button>
          ))}
          {canCreate ? (
            <button
              type="button"
              role="option"
              className="outreach-tag-suggest-item is-create"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(draft)}
            >
              Create “{normalizeOutreachTagName(draft)}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
