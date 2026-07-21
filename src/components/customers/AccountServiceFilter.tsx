'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type AccountServiceFilterProps = {
  options: string[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Shown when nothing is selected (default: "All services"). */
  emptyLabel?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
};

export function AccountServiceFilter({
  options,
  selected,
  onChange,
  emptyLabel = 'All services',
  searchPlaceholder = 'Search services…',
  ariaLabel = 'Filter by contract service',
}: AccountServiceFilterProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const summary = useMemo(() => {
    if (!selected.size) return emptyLabel;
    if (selected.size === 1) return [...selected][0]!;
    return `${selected.size} selected`;
  }, [selected, emptyLabel]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((label) => label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (label: string) => {
    const next = new Set(selected);
    const key = label.toLowerCase();
    const existing = [...next].find((item) => item.toLowerCase() === key);
    if (existing) next.delete(existing);
    else next.add(label);
    onChange(next);
  };

  const isSelected = (label: string) =>
    [...selected].some((item) => item.toLowerCase() === label.toLowerCase());

  const clear = () => {
    onChange(new Set());
    setMenuOpen(false);
  };

  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 280);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      minWidth: menuWidth,
      zIndex: 1200,
    });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setQuery('');
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="ac-kind-multi">
      <button
        ref={triggerRef}
        type="button"
        className="ac-select ac-kind-multi-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        title={selected.size ? [...selected].join(', ') : emptyLabel}
      >
        <span className="ac-kind-multi-summary">{summary}</span>
        <span className="ac-kind-multi-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="ac-kind-multi-menu"
            style={menuStyle}
            role="listbox"
            aria-multiselectable
            aria-label={ariaLabel}
          >
            <div className="ac-kind-multi-search-wrap">
              <input
                type="search"
                className="ac-search ac-kind-multi-search"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {filteredOptions.map((label) => (
              <label key={label} className="ac-kind-multi-option">
                <input
                  type="checkbox"
                  checked={isSelected(label)}
                  onChange={() => toggle(label)}
                />
                <span>{label}</span>
              </label>
            ))}
            {filteredOptions.length === 0 ? (
              <div className="ac-kind-multi-empty">No matching services</div>
            ) : null}
            <button type="button" className="ac-kind-multi-clear" onClick={clear}>
              Clear ({emptyLabel.toLowerCase()})
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
