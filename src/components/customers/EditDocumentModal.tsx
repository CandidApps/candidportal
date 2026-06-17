'use client';

import React, { useState } from 'react';
import {
  RECORD_KIND_OPTIONS,
  type CustomerDocument,
  type RecordKind,
} from '@/lib/customer-records';
import type { Location } from '@/components/CustomersView';

const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
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

type Props = {
  document: CustomerDocument;
  locations: Location[];
  onClose: () => void;
  onSave: (updated: CustomerDocument) => void;
  onDelete: () => void;
};

export function EditDocumentModal({ document, locations, onClose, onSave, onDelete }: Props) {
  const [recordKind, setRecordKind] = useState<RecordKind>(document.recordKind);
  const [locationId, setLocationId] = useState(document.locationId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = () => {
    onSave({ ...document, recordKind, locationId });
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
          width: 480,
          maxWidth: '95vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ background: BRAND.grayDark, padding: '20px 26px', position: 'relative' }}>
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
                Edit document
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, wordBreak: 'break-word' }}>
                {document.filename}
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 18 }}>
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, marginBottom: 6 }}>
              Document type
            </label>
            <select value={recordKind} onChange={(e) => setRecordKind(e.target.value as RecordKind)} style={inputStyle}>
              {['Billing', 'Sales', 'Contracts', 'Other'].map((group) => (
                <optgroup key={group} label={group}>
                  {RECORD_KIND_OPTIONS.filter((o) => o.group === group).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {locations.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, marginBottom: 6 }}>
                Location
              </label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={inputStyle}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                    {l.isPrimary ? ' (Primary)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(document.docSubtype || document.provider || document.amount != null || document.roiNote) && (
            <div
              style={{
                marginBottom: 16,
                padding: 14,
                background: BRAND.grayLight,
                borderRadius: 8,
                border: `1px solid ${BRAND.grayBorder}`,
                fontSize: 12,
                color: BRAND.grayDark,
                lineHeight: 1.6,
              }}
            >
              {document.docSubtype ? (
                <div><strong>Subtype:</strong> {document.docSubtype}</div>
              ) : null}
              {document.provider ? (
                <div><strong>Provider:</strong> {document.provider}</div>
              ) : null}
              {document.amount != null ? (
                <div><strong>Amount:</strong> ${document.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              ) : null}
              {document.signedDate ? (
                <div><strong>Signed:</strong> {document.signedDate}</div>
              ) : null}
              {document.roiNote ? (
                <div style={{ marginTop: 6, color: BRAND.gray }}>{document.roiNote}</div>
              ) : null}
            </div>
          )}

          <div style={{ fontSize: 12, color: BRAND.gray, marginBottom: 20 }}>
            Uploaded {document.date} · {document.size} · {document.uploadedBy}
          </div>

          {confirmDelete ? (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark, marginBottom: 8 }}>
                Remove this document from the customer record?
              </div>
              <div style={{ fontSize: 12, color: BRAND.gray, marginBottom: 12 }}>
                This removes it from the portal view only. The original file is not deleted from storage.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={onDelete}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: BRAND.red,
                    color: BRAND.white,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: `1px solid ${BRAND.grayBorder}`,
                    background: BRAND.white,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid #FECACA',
              background: '#FEF2F2',
              color: BRAND.red,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Delete document
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: 6,
                border: `1px solid ${BRAND.grayBorder}`,
                background: BRAND.white,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              style={{
                padding: '10px 18px',
                borderRadius: 6,
                border: 'none',
                background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
                color: BRAND.white,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
