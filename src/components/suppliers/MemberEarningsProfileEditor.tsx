'use client';

import {
  durationFromSelectValue,
  durationToSelectValue,
  emptyMemberEarningsProfile,
  formatMemberEarningsSentence,
  isMemberEarningsNone,
  MEMBER_EARNINGS_DURATION_OPTIONS,
  newMemberEarningsLine,
  parseMemberEarningsProfile,
  type MemberEarningsAmountType,
  type MemberEarningsCombinator,
  type MemberEarningsKind,
  type MemberEarningsLine,
  type MemberEarningsProfile,
} from '@/lib/member-earnings-profile';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  boxSizing: 'border-box',
};

const compactSelect: React.CSSProperties = {
  ...inputStyle,
  width: 'auto',
  minWidth: 0,
};

export function MemberEarningsProfileEditor({
  value,
  onChange,
}: {
  value: MemberEarningsProfile;
  onChange: (next: MemberEarningsProfile) => void;
}) {
  const enabled = !isMemberEarningsNone(value);
  const preview = formatMemberEarningsSentence(parseMemberEarningsProfile(value));

  const setEnabled = (on: boolean) => {
    if (!on) {
      onChange(emptyMemberEarningsProfile());
      return;
    }
    if (value.lines.length === 0) {
      onChange({ combinator: 'and', lines: [newMemberEarningsLine('discount')] });
      return;
    }
    onChange(value);
  };

  const updateLine = (id: string, patch: Partial<MemberEarningsLine>) => {
    onChange({
      ...value,
      lines: value.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });
  };

  const removeLine = (id: string) => {
    const lines = value.lines.filter((line) => line.id !== id);
    onChange(lines.length === 0 ? emptyMemberEarningsProfile() : { ...value, lines });
  };

  const addLine = (kind: MemberEarningsKind) => {
    const next = enabled ? value : { combinator: 'and' as const, lines: [] };
    onChange({ ...next, lines: [...next.lines, newMemberEarningsLine(kind)] });
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
        Member Earnings Profile
      </div>
      <p style={{ margin: '6px 0 12px', fontSize: 11, color: 'var(--gray)', lineHeight: 1.45 }}>
        What the customer earns on this supplier. Default is None (hidden on Find Solutions). Member copy
        uses discount / rebate / cash back — never “commission.” Traditional partner agent residual rates
        are unchanged.
      </p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="radio" name="mep-enabled" checked={!enabled} onChange={() => setEnabled(false)} />
          None
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="radio" name="mep-enabled" checked={enabled} onChange={() => setEnabled(true)} />
          Custom profile
        </label>
      </div>

      {enabled && (
        <>
          {value.lines.length >= 2 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 6 }}>
                When multiple lines
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="mep-combinator"
                    checked={value.combinator === 'and'}
                    onChange={() => onChange({ ...value, combinator: 'and' })}
                  />
                  AND (all apply)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="mep-combinator"
                    checked={value.combinator === 'or'}
                    onChange={() => onChange({ ...value, combinator: 'or' as MemberEarningsCombinator })}
                  />
                  OR (either)
                </label>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {value.lines.map((line) => (
              <div
                key={line.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <select
                  value={line.kind}
                  onChange={(e) => updateLine(line.id, { kind: e.target.value as MemberEarningsKind })}
                  style={{ ...compactSelect, width: 110 }}
                  aria-label="Earnings type"
                >
                  <option value="discount">Discount</option>
                  <option value="rebate">Rebate</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={line.amount || ''}
                  onChange={(e) => updateLine(line.id, { amount: Number(e.target.value) })}
                  placeholder="Amt"
                  style={{ ...inputStyle, width: 80 }}
                  aria-label="Amount"
                />
                <select
                  value={line.amountType}
                  onChange={(e) =>
                    updateLine(line.id, { amountType: e.target.value as MemberEarningsAmountType })
                  }
                  style={{ ...compactSelect, width: 64 }}
                  aria-label="Amount type"
                >
                  <option value="percent">%</option>
                  <option value="fixed">$</option>
                </select>
                <select
                  value={durationToSelectValue(line.duration)}
                  onChange={(e) =>
                    updateLine(line.id, { duration: durationFromSelectValue(e.target.value) })
                  }
                  style={{ ...inputStyle, flex: '1 1 160px', minWidth: 150 }}
                  aria-label="Duration"
                >
                  {MEMBER_EARNINGS_DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '6px 8px', whiteSpace: 'nowrap' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => addLine('discount')}
            >
              + Discount
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => addLine('rebate')}
            >
              + Rebate
            </button>
          </div>

          {preview && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 10px',
                borderRadius: 8,
                background: 'color-mix(in srgb, #15803d 8%, white)',
                border: '1px solid color-mix(in srgb, #15803d 22%, var(--gray-border))',
                fontSize: 12,
                color: '#166534',
                lineHeight: 1.45,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, marginBottom: 4 }}>
                MEMBER PREVIEW
              </div>
              {preview}
            </div>
          )}

          <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--gray)', lineHeight: 1.4 }}>
            Residual % (indefinitely / monthly) pays the member as a self-agent on their own deal. Demo
            lines are display-only. Partner commission schedules are not edited here.
          </p>
        </>
      )}
    </div>
  );
}
