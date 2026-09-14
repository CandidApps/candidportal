'use client';

import { newMemberPromo, type MemberPromo } from '@/lib/member-promos';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  boxSizing: 'border-box',
};

export function MemberPromosEditor({
  value,
  onChange,
}: {
  value: MemberPromo[];
  onChange: (next: MemberPromo[]) => void;
}) {
  const update = (id: string, patch: Partial<MemberPromo>) => {
    onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  return (
    <div
      style={{
        marginBottom: 18,
        marginTop: 6,
        padding: '14px 14px 12px',
        border: '1px solid var(--gray-border)',
        borderRadius: 10,
        background: 'var(--surface-muted, #f8f8f8)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-dark)', letterSpacing: 0.2 }}>
        Supplier promos
      </div>
      <p style={{ margin: '6px 0 12px', fontSize: 11, color: 'var(--gray)', lineHeight: 1.45 }}>
        Extra offers from the supplier (free install, statement credits, limited-time deals). Shown on Find
        Solutions next to cash back — not calculated with discount or rebate. Leave blank if there is no
        current promo.
      </p>

      {value.map((promo, index) => (
        <div
          key={promo.id}
          style={{
            marginBottom: 10,
            padding: 10,
            borderRadius: 8,
            border: '1px solid var(--gray-border)',
            background: 'var(--page-bg-solid, #fff)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)' }}>Promo {index + 1}</div>
            <button
              type="button"
              onClick={() => onChange(value.filter((p) => p.id !== promo.id))}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--gray)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Remove
            </button>
          </div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
            Headline
          </label>
          <input
            value={promo.title}
            onChange={(e) => update(promo.id, { title: e.target.value })}
            placeholder="e.g. Free installation on 36-month fiber"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
            Details (optional)
          </label>
          <textarea
            value={promo.details ?? ''}
            onChange={(e) => update(promo.id, { details: e.target.value })}
            rows={2}
            placeholder="Anything the customer should know — term, locations, fine print…"
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }}
          />
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
            Hide after (optional)
          </label>
          <input
            type="date"
            value={promo.expiresOn ?? ''}
            onChange={(e) => update(promo.id, { expiresOn: e.target.value || undefined })}
            style={{ ...inputStyle, maxWidth: 200 }}
          />
        </div>
      ))}

      <button
        type="button"
        className="btn-secondary"
        style={{ fontSize: 12, padding: '6px 12px' }}
        onClick={() => onChange([...value, newMemberPromo()])}
      >
        + Add promo
      </button>
    </div>
  );
}
