'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

export type RoadmapMultiFilterOption = { value: string; label: string };

export function RoadmapMultiFilter({
  label,
  allLabel,
  options,
  selected,
  onChange,
  searchable = false,
  searchPlaceholder = 'Search…',
}: {
  label: string;
  allLabel: string;
  options: RoadmapMultiFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** When true, show a search box inside the menu (Outreach tags, etc.). */
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${label} (${selected.length})`;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, searchable ? 260 : 220);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      minWidth: menuWidth,
      maxHeight: 'min(360px, calc(100vh - 24px))',
      zIndex: 10000,
    });
  }, [open, options.length, searchable]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    if (searchable) {
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, searchable]);

  return (
    <div className="roadmap-multi-filter">
      <button
        ref={triggerRef}
        type="button"
        className={`roadmap-select roadmap-multi-filter-trigger${selected.length ? ' has-selection' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="roadmap-multi-filter-summary">{summary}</span>
        <span className="roadmap-multi-filter-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="roadmap-multi-filter-menu"
          style={menuStyle}
          role="listbox"
          aria-multiselectable
          aria-label={label}
        >
          <div className="roadmap-multi-filter-menu-head">
            <span>{label}</span>
            {selected.length > 0 && (
              <button
                type="button"
                className="roadmap-link-btn"
                onClick={() => onChange([])}
              >
                Clear
              </button>
            )}
          </div>
          {searchable && (
            <div className="roadmap-multi-filter-search">
              <input
                ref={searchRef}
                type="search"
                className="roadmap-input"
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {options.length === 0 && (
            <div className="roadmap-muted roadmap-multi-filter-empty">No options yet</div>
          )}
          {options.length > 0 && filteredOptions.length === 0 && (
            <div className="roadmap-muted roadmap-multi-filter-empty">No matches</div>
          )}
          {filteredOptions.map((opt) => {
            const on = selected.includes(opt.value);
            return (
              <label key={opt.value} className={`roadmap-multi-filter-option${on ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
