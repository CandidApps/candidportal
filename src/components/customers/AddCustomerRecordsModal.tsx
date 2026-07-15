'use client';

import React, { useRef, useState } from 'react';
import {
  RECORD_KIND_OPTIONS,
  type CandidContractRecord,
  type CustomerDocument,
  type RecordKind,
} from '@/lib/customer-records';
import { parseContractDocumentFromFile } from '@/lib/contract-document-extract';
import {
  buildCustomerProfilePatchFromExtract,
  describeCustomerProfilePatch,
  guessRecordKindFromFile,
  mediaTypeForCustomerDocument,
  parseCustomerDocumentFromFile,
  type CustomerProfilePatch,
} from '@/lib/customer-document-extract';
import type { Location } from '@/components/CustomersView';
import {
  applyContractExtractToForm,
  buildCandidContractRecord,
  CandidContractDealFields,
  emptyCandidContractForm,
} from '@/components/customers/CandidContractDealFields';

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

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
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
  </label>
);

export type AddCustomerRecordsResult =
  | {
      type: 'document';
      doc: CustomerDocument;
      file?: File | null;
      profilePatch?: CustomerProfilePatch;
    }
  | {
      type: 'candid_contract';
      doc: CustomerDocument;
      contract: CandidContractRecord;
      file?: File | null;
      profilePatch?: CustomerProfilePatch;
    };

type Props = {
  customerId: string;
  locations: Location[];
  defaultLocationId: string;
  uploadedBy: string;
  customerWebsite?: string;
  customerMccCode?: string;
  primaryLocation?: Location | null;
  onClose: () => void;
  onSave: (result: AddCustomerRecordsResult) => void;
};

const newId = () => `id-${Math.random().toString(36).slice(2, 10)}`;

export function AddCustomerRecordsModal({
  customerId,
  locations,
  defaultLocationId,
  uploadedBy,
  customerWebsite,
  customerMccCode,
  primaryLocation,
  onClose,
  onSave,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recordKind, setRecordKind] = useState<RecordKind>('statement');
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [contractForm, setContractForm] = useState(() => emptyCandidContractForm(defaultLocationId));
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');
  const [profilePatch, setProfilePatch] = useState<CustomerProfilePatch | undefined>();

  const isCandidContract = recordKind === 'candid_contract';

  const handleFile = async (f: File) => {
    setFile(f);
    setParseNote('');
    setProfilePatch(undefined);

    const guessedKind = guessRecordKindFromFile(f);
    const looksLikeContract =
      guessedKind === 'candid_contract' ||
      guessedKind === 'external_contract' ||
      /contract|agreement|msa|sow|order\s*form/i.test(f.name);
    const shouldParseContract = looksLikeContract || recordKind === 'candid_contract';

    if (looksLikeContract) {
      setRecordKind('candid_contract');
    }

    const canParseDocument = Boolean(mediaTypeForCustomerDocument(f));
    if (!canParseDocument && !shouldParseContract) return;

    setParsing(true);
    const notes: string[] = [];
    try {
      if (canParseDocument) {
        try {
          const customerResult = await parseCustomerDocumentFromFile(f);
          const patch = buildCustomerProfilePatchFromExtract(customerResult, {
            website: customerWebsite,
            mccCode: customerMccCode,
            primaryLocation,
          });
          if (patch) {
            setProfilePatch(patch);
            const profileNote = describeCustomerProfilePatch(patch);
            if (profileNote) notes.push(profileNote);
          }
        } catch (err) {
          notes.push(
            err instanceof Error ? err.message : 'Could not read company profile from document.',
          );
        }
      }

      if (shouldParseContract) {
        try {
          const result = await parseContractDocumentFromFile(f);
          setContractForm((prev) => applyContractExtractToForm(prev, result));
          if (result.source === 'ai') {
            notes.push('Contract fields prefilled from document — please verify before saving.');
          } else if (result.source === 'filename') {
            notes.push(
              'Limited contract hints from filename only — enter details manually or try a PDF/image.',
            );
          } else {
            notes.push('Could not extract contract fields. Enter details manually.');
          }
        } catch (err) {
          notes.push(err instanceof Error ? err.message : 'Could not parse contract.');
        }
      } else if (canParseDocument && notes.length === 0) {
        notes.push('No empty profile fields found to update from this document.');
      }

      setParseNote(notes.join(' '));
    } finally {
      setParsing(false);
    }
  };

  const submit = () => {
    const loc = locationId || defaultLocationId;
    const filename = file?.name ?? `${recordKindLabel()}-${Date.now()}`;
    const doc: CustomerDocument = {
      id: newId(),
      customerId,
      locationId: loc,
      filename,
      recordKind,
      uploadedBy,
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      size: file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : '—',
    };

    if (isCandidContract) {
      const contractId = newId();
      const contract = buildCandidContractRecord(contractForm, {
        id: contractId,
        customerId,
        locationId: loc,
      });
      onSave({
        type: 'candid_contract',
        doc: { ...doc, contractId },
        contract,
        file,
        profilePatch,
      });
      return;
    }

    onSave({ type: 'document', doc, file, profilePatch });
  };

  function recordKindLabel() {
    return RECORD_KIND_OPTIONS.find((o) => o.value === recordKind)?.label ?? recordKind;
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 700,
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
          width: 760,
          maxWidth: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
      >
        <div
          style={{
            background: BRAND.grayDark,
            padding: '20px 26px',
            flexShrink: 0,
            position: 'relative',
          }}
        >
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 17,
                  fontWeight: 600,
                  color: BRAND.white,
                }}
              >
                Add Customer Record
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                Upload a file and classify it, or enter Candid contract details
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 30,
                height: 30,
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#9CA3AF',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
            <div>
              <FieldLabel>Record type *</FieldLabel>
              <select
                value={recordKind}
                onChange={(e) => {
                  const kind = e.target.value as RecordKind;
                  setRecordKind(kind);
                  if (kind === 'candid_contract' && file) {
                    void handleFile(file);
                  }
                }}
                style={inputStyle}
              >
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
            <div>
              <FieldLabel>Location</FieldLabel>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                style={inputStyle}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                    {l.isPrimary ? ' (Primary)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            style={{
              border: `2px dashed ${dragOver ? BRAND.red : BRAND.grayBorder}`,
              borderRadius: 10,
              padding: 24,
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 18,
              background: dragOver ? 'var(--red-light, #FEE2E2)' : BRAND.grayLight,
            }}
          >
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>
              {parsing ? 'Reading document…' : file ? file.name : 'Drop a file or click to browse'}
            </div>
            <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 4 }}>
              PDF or image — AI will extract contract and profile fields when applicable
            </div>
            {parseNote && (
              <div
                style={{
                  fontSize: 11,
                  color:
                    parseNote.includes('prefilled') || parseNote.includes('Will update')
                      ? '#1A7A4A'
                      : BRAND.gray,
                  marginTop: 8,
                }}
              >
                {parseNote}
              </div>
            )}
          </div>

          {isCandidContract && (
            <CandidContractDealFields
              value={contractForm}
              onChange={setContractForm}
              locations={locations}
            />
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: BRAND.grayLight,
                border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 7,
                padding: '11px 18px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              style={{
                background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
                color: BRAND.white,
                border: 'none',
                borderRadius: 7,
                padding: '11px 22px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save Record
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
