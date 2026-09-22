'use client';

import { useState, type KeyboardEvent } from 'react';
import { ChangeRequestTagChip } from '@/components/admin/ChangeRequestTagChip';
import {
  changeTagToneIndex,
  normalizeChangeTags,
} from '@/lib/services/product-change-requests';

export function ChangeRequestTagsField({
  tags,
  suggestions = [],
  onChange,
  disabled,
  placeholder = 'Add tag…',
}: {
  tags: string[];
  suggestions?: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const available = suggestions.filter((t) => !tags.includes(t)).slice(0, 12);

  const commit = (raw: string) => {
    const next = normalizeChangeTags([...tags, raw]);
    if (next.length === tags.length && raw.trim()) return;
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) commit(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="roadmap-tags-field">
      <div className="roadmap-tags-chips">
        {tags.map((tag) => (
          <ChangeRequestTagChip
            key={tag}
            tag={tag}
            onRemove={disabled ? undefined : () => onChange(tags.filter((t) => t !== tag))}
          />
        ))}
        {!disabled && (
          <input
            className="roadmap-tags-input"
            value={draft}
            disabled={disabled}
            placeholder={tags.length ? '' : placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (draft.trim()) commit(draft);
            }}
          />
        )}
      </div>
      {!disabled && available.length > 0 && (
        <div className="roadmap-tags-suggestions">
          {available.map((tag) => (
            <button
              key={tag}
              type="button"
              className="roadmap-tag-suggest"
              data-tone={changeTagToneIndex(tag)}
              onClick={() => commit(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
