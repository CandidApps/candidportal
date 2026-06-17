'use client';

import React, { useState } from 'react';
import type { CustomerActionKind, CustomerActionSeverity } from '@/lib/portal-import/merge';

const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${BRAND.grayBorder}`,
  borderRadius: 6,
  padding: '10px 12px',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 13,
  color: BRAND.grayDark,
  outline: 'none',
  boxSizing: 'border-box',
};

export type CustomActionDraft = {
  title: string;
  detail: string;
  severity: CustomerActionSeverity;
  kind: CustomerActionKind;
  suggestedAction: string;
  dueDate: string;
  provider: string;
};

type Props = {
  onClose: () => void;
  onSubmit: (draft: CustomActionDraft) => void;
  initial?: Partial<CustomActionDraft>;
};

export function AddCustomActionModal({ onClose, onSubmit, initial }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [severity, setSeverity] = useState<CustomerActionSeverity>(initial?.severity ?? 'soon');
  const [kind, setKind] = useState<CustomerActionKind>(initial?.kind ?? 'custom');
  const [suggestedAction, setSuggestedAction] = useState(
    initial?.suggestedAction ?? 'Follow up with customer on next check-in.',
  );
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [provider, setProvider] = useState(initial?.provider ?? '');

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      detail: detail.trim(),
      severity,
      kind,
      suggestedAction: suggestedAction.trim() || 'Follow up with customer.',
      dueDate: dueDate.trim(),
      provider: provider.trim(),
    });
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 750,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
    >
      <div
        style={{
          background: BRAND.white,
          borderRadius: 14,
          width: 560,
          maxWidth: '95vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ background: BRAND.grayDark, padding: '20px 26px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: BRAND.white }}>
            Add custom action
          </div>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Follow up on merchant statement" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Detail</label>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Priority</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as CustomerActionSeverity)} style={inputStyle}>
                <option value="urgent">Urgent</option>
                <option value="soon">Upcoming</option>
                <option value="info">Opportunity</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as CustomerActionKind)} style={inputStyle}>
                <option value="custom">Custom</option>
                <option value="renewal">Renewal</option>
                <option value="optimization">Optimization</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Provider (optional)</label>
              <input value={provider} onChange={(e) => setProvider(e.target.value)} style={inputStyle} placeholder="Comcast Business" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Suggested next step</label>
            <input value={suggestedAction} onChange={(e) => setSuggestedAction(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${BRAND.grayBorder}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 6, border: `1px solid ${BRAND.grayBorder}`, background: BRAND.white, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button type="button" onClick={submit} disabled={!title.trim()} style={{ padding: '10px 18px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, color: BRAND.white, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Add action</button>
        </div>
      </div>
    </div>
  );
}
