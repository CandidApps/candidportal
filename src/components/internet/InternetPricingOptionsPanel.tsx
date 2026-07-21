'use client';

import { useState } from 'react';
import type { InternetPricingOption } from '@/lib/internet/internet-quote-types';
import { InternetPricingOptionEditorModal } from '@/components/internet/InternetPricingOptionEditorModal';

export function InternetPricingOptionsPanel({
  options,
  onChange,
  disabled = false,
}: {
  options: InternetPricingOption[];
  onChange: (next: InternetPricingOption[]) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState<InternetPricingOption | null>(null);

  const toggleSelected = (id: string) => {
    onChange(
      options.map((o) => (o.id === id ? { ...o, selected: !o.selected } : o)),
    );
  };

  const removeOption = (id: string) => {
    onChange(options.filter((o) => o.id !== id));
  };

  const selected = options.filter((o) => o.selected);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="pricing-structures-panel-head">
        <div className="pricing-structures-eyebrow">Internet options for customer proposal</div>
        <p style={{ fontSize: 13, color: 'var(--gray)', margin: '6px 0 0' }}>
          Options highlighted in green best match the requested speed, type, and serviceability.
          Remove any option you do not want to send. Expand to edit parsed lines before publishing.
        </p>
      </div>
      <div className="card-body">
        <div className="pricing-structures-selected-grid">
          {options.map((opt) => {
            const isMatch = (opt.matchScore ?? 0) >= 20;
            return (
              <div
                key={opt.id}
                className={[
                  'pricing-structure-card',
                  opt.selected ? 'pricing-structure-card--current' : '',
                  isMatch ? 'internet-pricing-card--match' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{opt.supplierName}</div>
                    {isMatch ? (
                      <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                        Best match
                      </div>
                    ) : null}
                  </div>
                  {!disabled ? (
                    <button
                      type="button"
                      aria-label="Remove option"
                      onClick={() => removeOption(opt.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 18,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray)', margin: '8px 0' }}>
                  {opt.lines.length} pricing line{opt.lines.length === 1 ? '' : 's'}
                  {opt.lines[0]?.monthlyPrice != null
                    ? ` · from $${opt.lines[0].monthlyPrice}/mo`
                    : ''}
                </p>
                {opt.matchHighlights?.length ? (
                  <ul style={{ fontSize: 11, color: 'var(--gray-dark)', paddingLeft: 16, margin: '0 0 8px' }}>
                    {opt.matchHighlights.slice(0, 3).map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                ) : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="pricing-structure-expand-btn"
                    onClick={() => setEditing(opt)}
                  >
                    Review &amp; edit
                  </button>
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={opt.selected}
                      disabled={disabled}
                      onChange={() => toggleSelected(opt.id)}
                    />
                    Include in proposal
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 12 }}>
          {selected.length} option{selected.length === 1 ? '' : 's'} selected for publish.
        </p>
      </div>
      {editing ? (
        <InternetPricingOptionEditorModal
          option={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            onChange(options.map((o) => (o.id === next.id ? next : o)));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
