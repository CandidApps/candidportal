'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type CommissionRange = {
  min: number | null;
  max: number | null;
  /** Keep rows with no commission while a range is set. */
  includeBlank: boolean;
};

export const EMPTY_COMMISSION_RANGE: CommissionRange = { min: null, max: null, includeBlank: true };

export function isCommissionRangeActive(range: CommissionRange): boolean {
  return range.min != null || range.max != null || !range.includeBlank;
}

export function commissionInRange(value: number | null, range: CommissionRange): boolean {
  if (value == null) return range.includeBlank;
  if (range.min != null && value < range.min) return false;
  if (range.max != null && value > range.max) return false;
  return true;
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function summaryFor(range: CommissionRange): string {
  if (!isCommissionRangeActive(range)) return 'Any commission';
  const parts: string[] = [];
  if (range.min != null && range.max != null) parts.push(`${money(range.min)} – ${money(range.max)}`);
  else if (range.min != null) parts.push(`≥ ${money(range.min)}`);
  else if (range.max != null) parts.push(`≤ ${money(range.max)}`);
  if (!range.includeBlank) parts.push(parts.length ? 'no blanks' : 'Has commission');
  return parts.join(', ');
}

export function CommissionRangeFilter({
  value,
  onChange,
  bounds,
}: {
  value: CommissionRange;
  onChange: (next: CommissionRange) => void;
  /** Lowest / highest commission in the current rows (slider bounds). */
  bounds: { min: number; max: number };
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const lo = Math.floor(bounds.min);
  const hi = Math.max(lo + 1, Math.ceil(bounds.max));
  const step = hi - lo > 1000 ? 10 : 1;
  const sliderMin = value.min ?? lo;
  const sliderMax = value.max ?? hi;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 300;
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
      zIndex: 1200,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const setMin = (raw: string | number) => {
    const n = raw === '' ? null : Number(raw);
    const min = n == null || !Number.isFinite(n) || n <= lo ? null : n;
    onChange({ ...value, min, max: value.max != null && min != null && value.max < min ? min : value.max });
  };
  const setMax = (raw: string | number) => {
    const n = raw === '' ? null : Number(raw);
    const max = n == null || !Number.isFinite(n) || n >= hi ? null : n;
    onChange({ ...value, max, min: value.min != null && max != null && value.min > max ? max : value.min });
  };

  const active = isCommissionRangeActive(value);

  return (
    <div className="ac-kind-multi">
      <button
        ref={triggerRef}
        type="button"
        className="ac-select ac-kind-multi-trigger"
        aria-label="Filter contracts by commission range"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={active ? { borderColor: 'var(--red)' } : undefined}
      >
        <span className="ac-kind-multi-summary">{summaryFor(value)}</span>
        <span className="ac-kind-multi-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div ref={menuRef} className="ac-kind-multi-menu commission-range-menu" style={menuStyle} role="dialog" aria-label="Commission range">
            <div className="commission-range-inputs">
              <label>
                <span>Min $</span>
                <input
                  type="number"
                  className="ac-kind-multi-search"
                  min={lo}
                  max={hi}
                  step="0.01"
                  placeholder={String(lo)}
                  value={value.min ?? ''}
                  onChange={(e) => setMin(e.target.value)}
                />
              </label>
              <label>
                <span>Max $</span>
                <input
                  type="number"
                  className="ac-kind-multi-search"
                  min={lo}
                  max={hi}
                  step="0.01"
                  placeholder={String(hi)}
                  value={value.max ?? ''}
                  onChange={(e) => setMax(e.target.value)}
                />
              </label>
            </div>
            <div className="commission-range-slider">
              <input
                type="range"
                aria-label="Minimum commission"
                min={lo}
                max={hi}
                step={step}
                value={sliderMin}
                onChange={(e) => setMin(Math.min(Number(e.target.value), sliderMax))}
              />
              <input
                type="range"
                aria-label="Maximum commission"
                min={lo}
                max={hi}
                step={step}
                value={sliderMax}
                onChange={(e) => setMax(Math.max(Number(e.target.value), sliderMin))}
              />
              <div className="commission-range-bounds">
                <span>{money(lo)}</span>
                <span>{money(hi)}</span>
              </div>
            </div>
            <label className="ac-kind-multi-option">
              <input
                type="checkbox"
                checked={value.includeBlank}
                onChange={(e) => onChange({ ...value, includeBlank: e.target.checked })}
              />
              <span>Include contracts with no commission</span>
            </label>
            <button
              type="button"
              className="ac-kind-multi-clear"
              onClick={() => {
                onChange(EMPTY_COMMISSION_RANGE);
                setOpen(false);
              }}
            >
              Clear (any commission)
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
