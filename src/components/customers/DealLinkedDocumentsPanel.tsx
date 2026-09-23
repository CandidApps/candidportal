'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  documentDisplayName,
  recordKindLabel,
  type CandidContractRecord,
  type CustomerDocument,
  type RecordKind,
} from '@/lib/customer-records';
import {
  documentViewUrl,
  findDocumentsForContract,
  findDocumentForContract,
} from '@/lib/contract-document-link';
import { isCustomerDocumentAvailable } from '@/lib/crm/document-url';
import { openDocumentViewer } from '@/lib/document-viewer';
import {
  deleteCrmDocument,
  replaceCrmDocumentFile,
  saveCrmRecord,
  updateCrmDocument,
} from '@/lib/crm/client-persist';
import { ContractPreviewPane } from '@/components/shared/ContractPreviewPane';

const BRAND = {
  red: '#C8281E',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
} as const;

const ADD_KIND_OPTIONS: { value: RecordKind; label: string }[] = [
  { value: 'candid_contract', label: 'Contract' },
  { value: 'proposal', label: 'Proposal / quote' },
  { value: 'external_contract', label: 'External contract' },
  { value: 'other', label: 'Other / onboarding' },
];

type Props = {
  contract: CandidContractRecord;
  documents: CustomerDocument[];
  onDocumentsChange?: (next: CustomerDocument[]) => void;
  /** When true, show the PDF preview pane beside the list. */
  showPreview?: boolean;
  compact?: boolean;
};

/**
 * Multi-file list for a deal (CR-0032): add, replace selected, unlink (keep file), delete file.
 */
export function DealLinkedDocumentsPanel({
  contract,
  documents,
  onDocumentsChange,
  showPreview = true,
  compact = false,
}: Props) {
  const linked = useMemo(
    () => findDocumentsForContract(contract, documents),
    [contract, documents],
  );
  const primary = useMemo(
    () => findDocumentForContract(contract, documents),
    [contract, documents],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<RecordKind>('candid_contract');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addModeRef = useRef<'add' | 'replace'>('add');

  useEffect(() => {
    if (selectedId && linked.some((d) => d.id === selectedId)) return;
    setSelectedId(primary?.id ?? linked[0]?.id ?? null);
  }, [linked, primary, selectedId]);

  const selected = linked.find((d) => d.id === selectedId) ?? null;
  const docUrl =
    selected && isCustomerDocumentAvailable(selected) ? documentViewUrl(selected) : null;
  const docLabel = selected ? documentDisplayName(selected) : 'Deal document';

  const upsertLocal = (saved: CustomerDocument) => {
    const exists = documents.some((d) => d.id === saved.id);
    onDocumentsChange?.(
      exists ? documents.map((d) => (d.id === saved.id ? saved : d)) : [...documents, saved],
    );
  };

  const handleAddOrReplace = async (file: File) => {
    if (!file.size) return;
    setBusy(true);
    setNotice(null);
    try {
      if (addModeRef.current === 'replace' && selected) {
        const saved = await replaceCrmDocumentFile({
          customerId: contract.customerId,
          document: { ...selected, contractId: contract.id },
          file,
        });
        upsertLocal(saved);
        setSelectedId(saved.id);
        setNotice(`Updated: ${documentDisplayName(saved)}`);
      } else {
        const newDoc: CustomerDocument = {
          id: crypto.randomUUID(),
          customerId: contract.customerId,
          locationId: contract.locationId,
          filename: file.name,
          recordKind: addKind,
          uploadedBy: 'Candid Team',
          date: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          contractId: contract.id,
          provider: contract.solution || contract.vendor,
        };
        const saved = await saveCrmRecord({
          customerId: contract.customerId,
          document: newDoc,
          file,
        });
        upsertLocal(saved);
        setSelectedId(saved.id);
        setNotice(`Linked: ${documentDisplayName(saved)}`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleUnlink = async (doc: CustomerDocument) => {
    setBusy(true);
    setNotice(null);
    try {
      const { contractId: _cleared, ...rest } = doc;
      const next: CustomerDocument = { ...rest };
      await updateCrmDocument(contract.customerId, next);
      onDocumentsChange?.(documents.map((d) => (d.id === doc.id ? next : d)));
      setNotice(`Unlinked ${documentDisplayName(doc)} (file kept on account).`);
      if (selectedId === doc.id) setSelectedId(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unlink failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (doc: CustomerDocument) => {
    setBusy(true);
    setNotice(null);
    try {
      await deleteCrmDocument(contract.customerId, doc.id);
      onDocumentsChange?.(documents.filter((d) => d.id !== doc.id));
      setNotice('File deleted. The deal was kept.');
      setConfirmDeleteId(null);
      if (selectedId === doc.id) setSelectedId(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Delete failed');
      setConfirmDeleteId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: showPreview && !compact ? 'minmax(240px, 1fr) minmax(280px, 1.1fr)' : '1fr',
        gap: 14,
        alignItems: 'stretch',
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.grayDark }}>
            Deal files ({linked.length})
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as RecordKind)}
              style={{
                fontSize: 11,
                padding: '5px 8px',
                borderRadius: 6,
                border: `1px solid ${BRAND.grayBorder}`,
              }}
              aria-label="New file type"
            >
              {ADD_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              className="btn-secondary"
              style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={() => {
                addModeRef.current = 'add';
                fileRef.current?.click();
              }}
            >
              {busy ? 'Working…' : '+ Add file'}
            </button>
          </div>
        </div>

        {linked.length === 0 ? (
          <p style={{ fontSize: 12, color: BRAND.gray, margin: '0 0 8px' }}>
            No files linked yet. Add a contract, proposal, or onboarding doc.
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              border: `1px solid ${BRAND.grayBorder}`,
              borderRadius: 8,
              overflow: 'hidden',
              maxHeight: compact ? 220 : 320,
              overflowY: 'auto',
            }}
          >
            {linked.map((doc) => {
              const active = doc.id === selectedId;
              const available = isCustomerDocumentAvailable(doc);
              return (
                <li
                  key={doc.id}
                  style={{
                    borderBottom: `1px solid ${BRAND.grayBorder}`,
                    background: active ? 'rgba(200,40,30,0.05)' : BRAND.white,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(doc.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>
                      {documentDisplayName(doc)}
                    </div>
                    <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
                      {recordKindLabel(doc.recordKind)}
                      {!available ? ' · not viewable' : ''}
                    </div>
                  </button>
                  {active && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        padding: '0 12px 10px',
                      }}
                    >
                      {docUrl && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                          onClick={() =>
                            openDocumentViewer({
                              url: docUrl,
                              title: documentDisplayName(doc),
                              filename: doc.filename,
                            })
                          }
                        >
                          View
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        disabled={busy}
                        onClick={() => {
                          addModeRef.current = 'replace';
                          fileRef.current?.click();
                        }}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        disabled={busy}
                        onClick={() => void handleUnlink(doc)}
                      >
                        Unlink
                      </button>
                      {confirmDeleteId === doc.id ? (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            style={{
                              fontSize: 11,
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid #FECACA',
                              background: '#FEF2F2',
                              color: BRAND.red,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                            disabled={busy}
                            onClick={() => void handleDelete(doc)}
                          >
                            Confirm delete
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          style={{
                            fontSize: 11,
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #FECACA',
                            background: '#FEF2F2',
                            color: BRAND.red,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          disabled={busy}
                          onClick={() => setConfirmDeleteId(doc.id)}
                        >
                          Delete file
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {notice && (
          <p style={{ fontSize: 12, color: BRAND.gray, margin: '8px 0 0' }}>{notice}</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleAddOrReplace(file);
          }}
        />
      </div>

      {showPreview && (
        <ContractPreviewPane
          key={selected ? `${selected.id}:${selected.storagePath ?? selected.filename}` : 'empty'}
          url={docUrl}
          label={docLabel}
          filename={selected?.filename}
          compact={compact}
          emptyMessage="Select a linked file or add one to preview."
          onOpenFull={
            docUrl
              ? () =>
                  openDocumentViewer({
                    url: docUrl,
                    title: docLabel,
                    filename: selected?.filename,
                  })
              : undefined
          }
        />
      )}
    </div>
  );
}
