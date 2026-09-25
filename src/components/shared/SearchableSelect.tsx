'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export type SearchableOption = {
  value: string;
  label: string;
  /** Extra text matched in search but shown muted in the list. */
  meta?: string;
  keywords?: string;
};

type Props = {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  inputStyle?: CSSProperties;
  disabled?: boolean;
  allowClear?: boolean;
  'aria-label'?: string;
};

/**
 * Combobox-style searchable select for long option lists (locations, agents, providers).
 */
export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Search…',
  emptyLabel = '—',
  inputStyle,
  disabled,
  allowClear = true,
  'aria-label': ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) setQ(selected?.label ?? '');
  }, [open, selected?.label, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options.slice(0, 80);
    return options
      .filter((o) => {
        const hay = `${o.label} ${o.meta ?? ''} ${o.keywords ?? ''}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 80);
  }, [options, q]);

  const baseInput: CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--gray-border, #E2E2E2)',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    ...inputStyle,
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        aria-label={ariaLabel}
        disabled={disabled}
        value={open ? q : selected?.label ?? ''}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQ(selected?.label ?? '');
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        style={baseInput}
      />
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--card-bg, #fff)',
            border: '1px solid var(--gray-border, #E2E2E2)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
          }}
        >
          {allowClear && (
            <button
              type="button"
              role="option"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              style={optionBtnStyle}
            >
              <span style={{ color: 'var(--gray)' }}>{emptyLabel}</span>
            </button>
          )}
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray)' }}>No matches</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{
                  ...optionBtnStyle,
                  background: o.value === value ? 'rgba(200,40,30,0.06)' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--gray-dark, #1E1E1E)' }}>{o.label}</span>
                {o.meta ? (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                    {o.meta}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const optionBtnStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  borderBottom: '1px solid var(--gray-border, #E2E2E2)',
  background: 'transparent',
  padding: '10px 12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
};

export function SearchableSelectField({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--gray)',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
