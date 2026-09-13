'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { PAY_SOURCE_OPTIONS } from '@/lib/customer-records';
import {
  CANDID_DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TYPE_UI_OPTIONS,
  EXTERNAL_DOCUMENT_STATUS_OPTIONS,
  candidMrcFieldLabel,
  showMrcComparisonFields,
  type DocumentMetadataForm,
} from '@/lib/crm/document-metadata';

const BRAND = {
  gray: '#6B6B6B',
  grayDark: '#1E1E1E',
  grayBorder: '#E2E2E2',
  grayLight: '#F5F5F5',
  red: '#C8281E',
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

const FieldLabel: React.FC<{ children: React.ReactNode; required?: boolean }> = ({
  children,
  required,
}) => (
  <label
    style={{
      display: 'block',
      fontSize: 11,
      fontWeight: 600,
      color: BRAND.gray,
      letterSpacing: '0.06em',
      marginBottom: 5,
    }}
  >
    {children}
    {required ? ' *' : ''}
  </label>
);

type Props = {
  customerId: string;
  value: DocumentMetadataForm;
  onChange: (next: DocumentMetadataForm) => void;
  fileBaseName?: string;
};

export function DocumentMetadataFields({ customerId, value, onChange, fileBaseName }: Props) {
  const [otherTypeLabels, setOtherTypeLabels] = useState<string[]>([]);
  const [providerMode, setProviderMode] = useState<'list' | 'custom'>(
    value.previousProvider &&
      !PAY_SOURCE_OPTIONS.includes(value.previousProvider as (typeof PAY_SOURCE_OPTIONS)[number])
      ? 'custom'
      : 'list',
  );

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/crm/document-other-types?customerId=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((data: { labels?: string[] }) => {
        if (!cancelled && Array.isArray(data.labels)) setOtherTypeLabels(data.labels);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    if (!value.displayName && fileBaseName) {
      onChange({ ...value, displayName: fileBaseName.replace(/\.[^.]+$/, '') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed display name once from file
  }, [fileBaseName]);

  const statusOptions = useMemo(() => {
    if (value.isCandidAgreement === true) return CANDID_DOCUMENT_STATUS_OPTIONS;
    if (value.isCandidAgreement === false) return EXTERNAL_DOCUMENT_STATUS_OPTIONS;
    return [];
  }, [value.isCandidAgreement]);

  const patch = (partial: Partial<DocumentMetadataForm>) => {
    let next = { ...value, ...partial };

    if (partial.documentTypeUi && partial.documentTypeUi !== 'other') {
      next = { ...next, otherDocumentKind: '' };
    }

    if (partial.isCandidAgreement != null && partial.isCandidAgreement !== value.isCandidAgreement) {
      next = { ...next, serviceStatus: '' };
    }

    onChange(next);
  };

  const showMrc = showMrcComparisonFields(value.serviceStatus);
  const mrcLabel = candidMrcFieldLabel(value.serviceStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <FieldLabel required>Document type</FieldLabel>
        <select
          value={value.documentTypeUi}
          onChange={(e) =>
            patch({ documentTypeUi: e.target.value as DocumentMetadataForm['documentTypeUi'] })
          }
          style={inputStyle}
        >
          {DOCUMENT_TYPE_UI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {value.documentTypeUi === 'other' && (
        <div>
          <FieldLabel required>What kind of document is this?</FieldLabel>
          <input
            list="doc-other-type-suggestions"
            value={value.otherDocumentKind}
            onChange={(e) => patch({ otherDocumentKind: e.target.value })}
            placeholder="e.g. Site survey, W-9, insurance certificate"
            style={inputStyle}
          />
          <datalist id="doc-other-type-suggestions">
            {otherTypeLabels.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
      )}

      <div>
        <FieldLabel>Document name in system</FieldLabel>
        <input
          value={value.displayName}
          onChange={(e) => patch({ displayName: e.target.value })}
          placeholder="Name shown in portal and admin (defaults to file name)"
          style={inputStyle}
        />
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: BRAND.grayDark,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={value.shareInPortal}
          onChange={(e) => patch({ shareInPortal: e.target.checked })}
        />
        Share this document in the customer portal
      </label>

      <div>
        <FieldLabel required>Is this a Candid Document/Agreement?</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['yes', 'no'] as const).map((choice) => {
            const selected =
              choice === 'yes' ? value.isCandidAgreement === true : value.isCandidAgreement === false;
            return (
              <button
                key={choice}
                type="button"
                onClick={() => patch({ isCandidAgreement: choice === 'yes' })}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: `1px solid ${selected ? BRAND.red : BRAND.grayBorder}`,
                  background: selected ? 'rgba(200,40,30,0.08)' : BRAND.grayLight,
                  fontWeight: selected ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {choice === 'yes' ? 'Yes' : 'No'}
              </button>
            );
          })}
        </div>
      </div>

      {value.isCandidAgreement != null && (
        <div>
          <FieldLabel required>Status</FieldLabel>
          <select
            value={value.serviceStatus}
            onChange={(e) =>
              patch({ serviceStatus: e.target.value as DocumentMetadataForm['serviceStatus'] })
            }
            style={inputStyle}
          >
            <option value="">Select status…</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showMrc && (
        <>
          <div>
            <FieldLabel>Previous provider</FieldLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setProviderMode('list')}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: `1px solid ${providerMode === 'list' ? BRAND.red : BRAND.grayBorder}`,
                  background: providerMode === 'list' ? 'rgba(200,40,30,0.06)' : '#fff',
                  cursor: 'pointer',
                }}
              >
                From list
              </button>
              <button
                type="button"
                onClick={() => setProviderMode('custom')}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 4,
                  border: `1px solid ${providerMode === 'custom' ? BRAND.red : BRAND.grayBorder}`,
                  background: providerMode === 'custom' ? 'rgba(200,40,30,0.06)' : '#fff',
                  cursor: 'pointer',
                }}
              >
                Enter manually
              </button>
            </div>
            {providerMode === 'list' ? (
              <select
                value={value.previousProvider}
                onChange={(e) => patch({ previousProvider: e.target.value })}
                style={inputStyle}
              >
                <option value="">Select provider…</option>
                {PAY_SOURCE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={value.previousProvider}
                onChange={(e) => patch({ previousProvider: e.target.value })}
                placeholder="Previous provider name"
                style={inputStyle}
              />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <FieldLabel>Previous MRC ($)</FieldLabel>
              <input
                type="text"
                inputMode="decimal"
                value={value.previousMrc}
                onChange={(e) => patch({ previousMrc: e.target.value })}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>{mrcLabel}</FieldLabel>
              <input
                type="text"
                inputMode="decimal"
                value={value.candidMrc}
                onChange={(e) => patch({ candidMrc: e.target.value })}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
