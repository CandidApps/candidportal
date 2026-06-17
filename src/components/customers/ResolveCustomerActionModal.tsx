'use client';

import React, { useRef, useState } from 'react';
import type { CustomerAction } from '@/lib/portal-import/merge';
import type { ActionResolutionOutcome } from '@/lib/customer-actions-store';
import { outcomeLabel } from '@/lib/customer-actions-store';
import {
  parseContractDocumentFromFile,
  type ContractDocumentExtractResult,
} from '@/lib/contract-document-extract';

const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
  green: '#1A7A4A',
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

const OUTCOMES: { value: ActionResolutionOutcome; label: string }[] = [
  { value: 'renewed', label: 'Renewed / extended' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'deferred', label: 'Deferred / in progress' },
  { value: 'no_change', label: 'No change needed' },
  { value: 'completed', label: 'Completed' },
  { value: 'other', label: 'Other / closed' },
];

export type ResolveActionSubmit = {
  outcome: ActionResolutionOutcome;
  notes: string;
  file: File | null;
  extract: ContractDocumentExtractResult | null;
};

type Props = {
  action: CustomerAction;
  onClose: () => void;
  onSubmit: (payload: ResolveActionSubmit) => void | Promise<void>;
  initialOutcome?: ActionResolutionOutcome;
  initialNotes?: string;
};

export function ResolveCustomerActionModal({
  action,
  onClose,
  onSubmit,
  initialOutcome,
  initialNotes,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const defaultOutcome =
    action.kind === 'renewal'
      ? 'renewed'
      : action.kind === 'optimization'
        ? 'completed'
        : 'other';

  const [outcome, setOutcome] = useState<ActionResolutionOutcome>(
    initialOutcome ?? defaultOutcome,
  );
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [extract, setExtract] = useState<ContractDocumentExtractResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    setParseNote('');
    try {
      const result = await parseContractDocumentFromFile(f);
      setExtract(result);
      if (result.source === 'ai') {
        setParseNote('Contract details extracted — review before closing.');
      } else if (result.source === 'filename') {
        setParseNote('Limited hints from filename — add notes or edit contract after save.');
      } else {
        setParseNote('Could not extract contract fields. You can still attach the file.');
      }
    } catch (err) {
      setExtract(null);
      setParseNote(err instanceof Error ? err.message : 'Could not parse contract.');
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({ outcome, notes, file, extract });
    } finally {
      setSaving(false);
    }
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
          width: 640,
          maxWidth: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ background: BRAND.grayDark, padding: '20px 26px', flexShrink: 0, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})`,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: BRAND.white }}>
                Close action
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, lineHeight: 1.4 }}>{action.title}</div>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, marginBottom: 6 }}>
            Resolution
          </label>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as ActionResolutionOutcome)}
            style={{ ...inputStyle, marginBottom: 16 }}
          >
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, marginBottom: 6 }}>
            Notes / context
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="What happened? e.g. renewed for 24 months at $142.95/mo, customer declined SecurityEdge…"
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }}
          />

          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, marginBottom: 6 }}>
            Supporting document (optional)
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${BRAND.grayBorder}`,
              borderRadius: 10,
              padding: 20,
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 12,
              background: BRAND.grayLight,
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {file ? (
              <div style={{ fontSize: 13, color: BRAND.grayDark }}>
                <strong>{file.name}</strong>
                {parsing && <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 6 }}>Parsing contract…</div>}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: BRAND.gray }}>
                Upload signed contract, SOA, or renewal order — we&apos;ll extract dates and MRC
              </div>
            )}
          </div>
          {parseNote && (
            <div style={{ fontSize: 12, color: parseNote.includes('extracted') ? BRAND.green : BRAND.gray, marginBottom: 12 }}>
              {parseNote}
            </div>
          )}

          {extract && (extract.provider || extract.mrc || extract.contractEndDate) && (
            <div
              style={{
                background: BRAND.grayLight,
                border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 8,
                padding: 14,
                fontSize: 12,
                color: BRAND.grayDark,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Extracted contract fields</div>
              {extract.provider && <div>Provider: {extract.provider}</div>}
              {extract.product && <div>Product: {extract.product}</div>}
              {extract.mrc != null && <div>MRC: ${extract.mrc.toFixed(2)}</div>}
              {extract.contractStartDate && <div>Start: {extract.contractStartDate}</div>}
              {extract.contractEndDate && <div>End: {extract.contractEndDate}</div>}
              {extract.dealId && <div>Deal / account ID: {extract.dealId}</div>}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 6, border: `1px solid ${BRAND.grayBorder}`, background: BRAND.white, cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || parsing}
            onClick={() => void submit()}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              border: 'none',
              background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
              color: BRAND.white,
              cursor: saving || parsing ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {saving ? 'Saving…' : `Close as ${outcomeLabel(outcome)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
