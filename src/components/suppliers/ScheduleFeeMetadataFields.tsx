'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FEE_APPLIED_ON_LABELS,
  FEE_APPLIED_ON_OPTIONS,
  FEE_OCCURRENCE_LABELS,
  FEE_OCCURRENCES,
  FEE_TIER_APPLIED_LABELS,
  FEE_TIER_APPLIED_OPTIONS,
  type FeeAppliedOn,
  type FeeOccurrence,
  type FeeTierApplied,
} from '@/lib/schedule-a-types';

type MultiSelectProps<T extends string> = {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (next: T[]) => void;
};

function MetadataMultiSelect<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: MultiSelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const summary = value.length ? value.map((v) => labels[v]).join(', ') : 'All';

  const toggle = (opt: T) => {
    const next = value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt];
    onChange(next);
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 200);
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      minWidth: menuWidth,
      zIndex: 10000,
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

  const menu =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={menuRef}
        className="schedule-fee-meta-select-menu schedule-fee-meta-select-menu--portal"
        style={menuStyle}
        role="listbox"
        aria-label={label}
      >
        {options.map((opt) => (
          <label key={opt} className="schedule-fee-meta-select-option">
            <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} />
            <span>{labels[opt]}</span>
          </label>
        ))}
        <button
          type="button"
          className="schedule-fee-meta-select-clear"
          onClick={() => {
            onChange([]);
            setOpen(false);
          }}
        >
          Clear
        </button>
      </div>,
      document.body,
    );

  return (
    <div className="schedule-fee-meta-select">
      <button
        ref={triggerRef}
        type="button"
        className="schedule-fee-meta-select-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        title={summary}
      >
        {summary}
      </button>
      {menu}
    </div>
  );
}

export function ScheduleFeeMetadataFields({
  feeOccurrence,
  feeAppliedOn,
  tierApplied,
  onChange,
  fields = 'all',
}: {
  feeOccurrence?: FeeOccurrence;
  feeAppliedOn?: FeeAppliedOn[];
  tierApplied?: FeeTierApplied[];
  onChange: (patch: {
    feeOccurrence?: FeeOccurrence;
    feeAppliedOn?: FeeAppliedOn[];
    tierApplied?: FeeTierApplied[];
  }) => void;
  fields?: 'all' | 'occurrence' | 'appliedOn' | 'tier';
}) {
  const applied = feeAppliedOn ?? [];
  const tiers = tierApplied ?? [];

  if (fields === 'occurrence') {
    return (
      <select
        className="schedule-fee-meta-occurrence"
        value={feeOccurrence ?? ''}
        onChange={(e) =>
          onChange({
            feeOccurrence: e.target.value ? (e.target.value as FeeOccurrence) : undefined,
          })
        }
        aria-label="Fee occurrence"
      >
        <option value="">Auto</option>
        {FEE_OCCURRENCES.map((opt) => (
          <option key={opt} value={opt}>
            {FEE_OCCURRENCE_LABELS[opt]}
          </option>
        ))}
      </select>
    );
  }

  if (fields === 'appliedOn') {
    return (
      <MetadataMultiSelect
        label="Fee applied on"
        options={FEE_APPLIED_ON_OPTIONS}
        labels={FEE_APPLIED_ON_LABELS}
        value={applied}
        onChange={(next) => onChange({ feeAppliedOn: next })}
      />
    );
  }

  if (fields === 'tier') {
    return (
      <MetadataMultiSelect
        label="Tier applied"
        options={FEE_TIER_APPLIED_OPTIONS}
        labels={FEE_TIER_APPLIED_LABELS}
        value={tiers}
        onChange={(next) => onChange({ tierApplied: next })}
      />
    );
  }

  return (
    <>
      <select
        className="schedule-fee-meta-occurrence"
        value={feeOccurrence ?? ''}
        onChange={(e) =>
          onChange({
            feeOccurrence: e.target.value ? (e.target.value as FeeOccurrence) : undefined,
          })
        }
        aria-label="Fee occurrence"
      >
        <option value="">Auto</option>
        {FEE_OCCURRENCES.map((opt) => (
          <option key={opt} value={opt}>
            {FEE_OCCURRENCE_LABELS[opt]}
          </option>
        ))}
      </select>
      <MetadataMultiSelect
        label="Fee applied on"
        options={FEE_APPLIED_ON_OPTIONS}
        labels={FEE_APPLIED_ON_LABELS}
        value={applied}
        onChange={(next) => onChange({ feeAppliedOn: next })}
      />
      <MetadataMultiSelect
        label="Tier applied"
        options={FEE_TIER_APPLIED_OPTIONS}
        labels={FEE_TIER_APPLIED_LABELS}
        value={tiers}
        onChange={(next) => onChange({ tierApplied: next })}
      />
    </>
  );
}
