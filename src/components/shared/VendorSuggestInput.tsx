'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

/** Combobox: pick from suggestions or add a custom vendor name. */
export function VendorSuggestInput({
  value,
  onChange,
  onAdd,
  suggestions,
  placeholder = 'Vendor name — e.g. RingCentral, Comcast Business',
  className = 'nq-input',
}: {
  value: string;
  onChange: (next: string) => void;
  onAdd: (name: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = suggestions
      .filter(Boolean)
      .filter((s, i, arr) => arr.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
      .sort((a, b) => a.localeCompare(b));
    if (!q) return list.slice(0, 12);
    return list.filter((s) => s.toLowerCase().includes(q)).slice(0, 12);
  }, [suggestions, value]);

  const exactMatch = filtered.some((s) => s.toLowerCase() === value.trim().toLowerCase());
  const canAddCustom = value.trim().length > 0 && !exactMatch;

  useEffect(() => {
    setHighlight(0);
  }, [value]);

  const choose = (name: string) => {
    onAdd(name);
    setOpen(false);
  };

  const commit = () => {
    if (!value.trim()) return;
    if (filtered[highlight] && open) {
      choose(filtered[highlight]);
      return;
    }
    choose(value.trim());
  };

  return (
    <div className="nq-vendor-ac">
      <div className="nq-vendor-add">
        <input
          className={className}
          placeholder={placeholder}
          value={value}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open && (filtered.length > 0 || canAddCustom)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 150);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <button type="button" className="btn-secondary" onClick={commit} disabled={!value.trim()}>
          Add
        </button>
      </div>
      {open && (filtered.length > 0 || canAddCustom) ? (
        <ul
          id={listId}
          className="nq-vendor-ac-list"
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                className={`nq-vendor-ac-option${i === highlight ? ' is-active' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(name)}
              >
                {name}
              </button>
            </li>
          ))}
          {canAddCustom ? (
            <li>
              <button
                type="button"
                className="nq-vendor-ac-option nq-vendor-ac-option--custom"
                onClick={() => choose(value.trim())}
              >
                Add “{value.trim()}”
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
