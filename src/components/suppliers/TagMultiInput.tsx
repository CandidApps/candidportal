'use client';

import { useState } from 'react';
import { normalizeTagList } from '@/lib/solutions/find-solutions-tags';

export function TagMultiInput({
  label,
  hint,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: readonly string[];
}) {
  const [draft, setDraft] = useState('');
  const selected = normalizeTagList(value);
  const selectedLower = new Set(selected.map((t) => t.toLowerCase()));

  const add = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    onChange(normalizeTagList([...selected, tag]));
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(selected.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
  };

  const unusedSuggestions = suggestions.filter((s) => !selectedLower.has(s.toLowerCase()));

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
        {label}
      </label>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 8, lineHeight: 1.35 }}>{hint}</div>
      )}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selected.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => remove(tag)}
              title="Remove"
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: 999,
                border: '1px solid var(--gray-border)',
                background: 'var(--surface)',
                color: 'var(--gray-dark)',
                cursor: 'pointer',
              }}
            >
              {tag} ×
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="Type a tag and press Enter"
          style={{
            flex: 1,
            border: '1px solid var(--gray-border)',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 13,
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          className="btn-secondary"
          style={{ fontSize: 12, padding: '8px 12px', flexShrink: 0 }}
          onClick={() => add(draft)}
          disabled={!draft.trim()}
        >
          Add
        </button>
      </div>
      {unusedSuggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {unusedSuggestions.slice(0, 16).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px dashed var(--gray-border)',
                background: 'transparent',
                color: 'var(--gray)',
                cursor: 'pointer',
              }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
