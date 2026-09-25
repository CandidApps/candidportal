'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { parseContractDocumentFromFile } from '@/lib/contract-document-extract';
import {
  applyContractExtractToForm,
  candidContractFormFromRecord,
} from '@/components/customers/CandidContractDealFields';

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
  /** Apply blanks-only extract onto the parent contract form when reparsing. */
  onReparseBlanks?: (partial: Partial<CandidContractRecord>) => void;
  /**
   * - side: accordion only (parent shows preview in a right column) — edit modal
   * - inline: preview under the selected accordion row — compact / nested UIs
   * - none: list only
   */
  previewMode?: 'side' | 'inline' | 'none';
  /** Controlled selection for side preview (edit modal). */
  selectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;
  compact?: boolean;
};

/**
 * CR-0050 — Deal-linked files accordion with link-existing dropdown.
 * Preview lives in a sibling column when previewMode="side".
 */
export function DealLinkedDocumentsPanel({
  contract,
  documents,
  onDocumentsChange,
  onReparseBlanks,
  previewMode = 'side',
  selectedId: controlledSelectedId,
  onSelectedIdChange,
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
  const unlinked = useMemo(
    () =>
      documents.filter(
        (d) => d.customerId === contract.customerId && d.contractId !== contract.id,
      ),
    [documents, contract.customerId, contract.id],
  );

  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedId =
    controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;
  const setSelectedId = (id: string | null) => {
    if (controlledSelectedId === undefined) setInternalSelectedId(id);
    onSelectedIdChange?.(id);
  };

  const [addKind, setAddKind] = useState<RecordKind>('candid_contract');
  const [linkDocId, setLinkDocId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addModeRef = useRef<'add' | 'replace'>('add');
  const replaceTargetRef = useRef<string | null>(null);

  // Keep selection valid when the linked set changes — never fight a user collapse.
  useEffect(() => {
    if (linked.length === 0) {
      if (selectedId != null) setSelectedId(null);
      return;
    }
    if (selectedId && linked.some((d) => d.id === selectedId)) return;
    setSelectedId(primary?.id ?? linked[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when membership changes
  }, [linked, primary?.id]);

  const selectedDoc = useMemo(
    () => linked.find((d) => d.id === selectedId) ?? null,
    [linked, selectedId],
  );

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
      const replaceId = replaceTargetRef.current;
      const selected = replaceId ? linked.find((d) => d.id === replaceId) : null;
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
      replaceTargetRef.current = null;
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleLinkExisting = async () => {
    const doc = documents.find((d) => d.id === linkDocId);
    if (!doc) return;
    // Already linked to this contract (or duplicate of same storage path)
    if (doc.contractId === contract.id) {
      setSelectedId(doc.id);
      setLinkDocId('');
      setNotice('That file is already linked to this contract.');
      return;
    }
    const samePath = doc.storagePath
      ? linked.some((d) => d.storagePath && d.storagePath === doc.storagePath)
      : linked.some(
          (d) =>
            (d.displayName || d.filename).toLowerCase() ===
              (doc.displayName || doc.filename).toLowerCase() && d.size === doc.size,
        );
    if (samePath) {
      setLinkDocId('');
      setNotice('A copy of that file is already linked to this contract.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const next: CustomerDocument = { ...doc, contractId: contract.id };
      await updateCrmDocument(contract.customerId, next);
      onDocumentsChange?.(documents.map((d) => (d.id === doc.id ? next : d)));
      setSelectedId(doc.id);
      setLinkDocId('');
      setNotice(`Linked ${documentDisplayName(doc)} to this contract.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Link failed');
    } finally {
      setBusy(false);
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
      if (selectedId === doc.id) {
        const remaining = linked.filter((d) => d.id !== doc.id);
        setSelectedId(remaining[0]?.id ?? null);
      }
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
      if (selectedId === doc.id) {
        const remaining = linked.filter((d) => d.id !== doc.id);
        setSelectedId(remaining[0]?.id ?? null);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Delete failed');
      setConfirmDeleteId(null);
    } finally {
      setBusy(false);
    }
  };

  const handleReparse = async (doc: CustomerDocument) => {
    if (!onReparseBlanks) return;
    const url = documentViewUrl(doc);
    if (!url) {
      setNotice('No file available to reparse.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not download file for reparse');
      const blob = await res.blob();
      const file = new File([blob], doc.filename || 'contract.pdf', {
        type: blob.type || 'application/pdf',
      });
      const extract = await parseContractDocumentFromFile(file);
      const currentForm = candidContractFormFromRecord(contract);
      const merged = applyContractExtractToForm(currentForm, extract);
      const blankFill: Partial<CandidContractRecord> = {};
      if (!contract.solution && merged.solution) blankFill.solution = merged.solution;
      if (!contract.product && merged.product) blankFill.product = merged.product;
      if (!contract.service && merged.service) blankFill.service = merged.service;
      if (!contract.paySource && merged.paySource) blankFill.paySource = merged.paySource;
      if (!contract.dealId && merged.dealId) blankFill.dealId = merged.dealId;
      if (!contract.contractStartDate && merged.contractStartDate) {
        blankFill.contractStartDate = merged.contractStartDate;
      }
      if (!contract.contractEndDate && merged.contractEndDate) {
        blankFill.contractEndDate = merged.contractEndDate;
      }
      if (contract.monthly == null && merged.mrr.trim()) {
        const n = Number(merged.mrr);
        if (Number.isFinite(n)) blankFill.monthly = n;
      }
      if (contract.mrc == null && merged.mrc.trim()) {
        const n = Number(merged.mrc);
        if (Number.isFinite(n)) blankFill.mrc = n;
      }
      onReparseBlanks(blankFill);
      setNotice(
        Object.keys(blankFill).length
          ? `Reparsed — filled ${Object.keys(blankFill).length} blank field(s). Existing values were not changed.`
          : 'Reparsed — no blank fields to fill.',
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Reparse failed');
    } finally {
      setBusy(false);
    }
  };

  const isContractKind = (kind: RecordKind) =>
    kind === 'candid_contract' || kind === 'external_contract';

  const selectedUrl =
    selectedDoc && isCustomerDocumentAvailable(selectedDoc)
      ? documentViewUrl(selectedDoc)
      : null;

  const list = (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.grayDark }}>
          Deal files ({linked.length})
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={linkDocId}
            onChange={(e) => setLinkDocId(e.target.value)}
            style={{
              fontSize: 11,
              padding: '5px 8px',
              borderRadius: 6,
              border: `1px solid ${BRAND.grayBorder}`,
              minWidth: 160,
            }}
            aria-label="Link existing document"
          >
            <option value="">Link existing document…</option>
            {unlinked.map((d) => (
              <option key={d.id} value={d.id}>
                {documentDisplayName(d)}
                {d.contractId ? ' (linked elsewhere)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 11, padding: '5px 10px' }}
            disabled={busy || !linkDocId}
            onClick={() => void handleLinkExisting()}
          >
            Link
          </button>
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
              replaceTargetRef.current = null;
              fileRef.current?.click();
            }}
          >
            {busy ? 'Working…' : '+ Add file'}
          </button>
        </div>
      </div>

      {linked.length === 0 ? (
        <p style={{ fontSize: 12, color: BRAND.gray, margin: 0 }}>
          No files linked yet. Link an existing account document or upload a new one.
        </p>
      ) : (
        <div
          style={{
            border: `1px solid ${BRAND.grayBorder}`,
            borderRadius: 10,
            overflow: 'hidden',
            background: BRAND.white,
          }}
        >
          {linked.map((doc) => {
            const selected = doc.id === selectedId;
            const available = isCustomerDocumentAvailable(doc);
            const url = available ? documentViewUrl(doc) : null;
            return (
              <div
                key={doc.id}
                style={{ borderBottom: `1px solid ${BRAND.grayBorder}` }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    background: selected ? 'rgba(200,40,30,0.04)' : BRAND.white,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(doc.id)}
                    style={{
                      flex: 1,
                      minWidth: 140,
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.grayDark }}>
                      {selected ? '▾ ' : '▸ '}
                      {documentDisplayName(doc)}
                    </div>
                    <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
                      {recordKindLabel(doc.recordKind)}
                      {!available ? ' · not viewable' : ''}
                    </div>
                  </button>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {url && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() =>
                          openDocumentViewer({
                            url,
                            title: documentDisplayName(doc),
                            filename: doc.filename,
                          })
                        }
                      >
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => setSelectedId(doc.id)}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 8px' }}
                      disabled={busy}
                      onClick={() => {
                        addModeRef.current = 'replace';
                        replaceTargetRef.current = doc.id;
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
                    {isContractKind(doc.recordKind) && onReparseBlanks && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        disabled={busy || !available}
                        onClick={() => void handleReparse(doc)}
                        title="Fill blank contract fields only — never overrides existing values"
                      >
                        Reparse
                      </button>
                    )}
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
                          style={deleteBtnStyle}
                          disabled={busy}
                          onClick={() => void handleDelete(doc)}
                        >
                          Confirm delete
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        style={deleteBtnStyle}
                        disabled={busy}
                        onClick={() => setConfirmDeleteId(doc.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {previewMode === 'inline' && selected && (
                  <div style={{ padding: compact ? 8 : 12, background: BRAND.grayLight }}>
                    <ContractPreviewPane
                      key={`${doc.id}:${doc.storagePath ?? doc.filename}`}
                      url={url}
                      label={documentDisplayName(doc)}
                      filename={doc.filename}
                      compact={compact}
                      emptyMessage="Select or upload a file to preview."
                      onOpenFull={
                        url
                          ? () =>
                              openDocumentViewer({
                                url,
                                title: documentDisplayName(doc),
                                filename: doc.filename,
                              })
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {notice && (
        <p style={{ fontSize: 12, color: BRAND.gray, margin: 0 }}>{notice}</p>
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
  );

  if (previewMode !== 'side') return list;

  // Side mode: list only — parent owns the right-column preview via selectedId.
  // Also expose a ready-to-mount preview node via data attributes is awkward;
  // parent reads selection. When used without controlled props, render both here.
  if (controlledSelectedId !== undefined) return list;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : 'minmax(280px, 1fr) minmax(320px, 1.15fr)',
        gap: 0,
        minHeight: compact ? undefined : 420,
        flex: 1,
      }}
    >
      <div style={{ paddingRight: compact ? 0 : 12, minWidth: 0 }}>{list}</div>
      {!compact && (
        <div
          style={{
            borderLeft: `1px solid ${BRAND.grayBorder}`,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            background: BRAND.grayLight,
          }}
        >
          <ContractPreviewPane
            key={
              selectedDoc
                ? `${selectedDoc.id}:${selectedDoc.storagePath ?? selectedDoc.filename}`
                : 'empty'
            }
            url={selectedUrl}
            label={selectedDoc ? documentDisplayName(selectedDoc) : 'Deal file'}
            filename={selectedDoc?.filename}
            emptyMessage="Select a linked file or add one to preview."
            onOpenFull={
              selectedUrl && selectedDoc
                ? () =>
                    openDocumentViewer({
                      url: selectedUrl,
                      title: documentDisplayName(selectedDoc),
                      filename: selectedDoc.filename,
                    })
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

/** Right-column preview for edit-contract split layout (controlled selection). */
export function DealFilePreviewPane({
  contract,
  documents,
  selectedId,
}: {
  contract: CandidContractRecord;
  documents: CustomerDocument[];
  selectedId: string | null;
}) {
  const linked = useMemo(
    () => findDocumentsForContract(contract, documents),
    [contract, documents],
  );
  const doc = linked.find((d) => d.id === selectedId) ?? linked[0] ?? null;
  const url = doc && isCustomerDocumentAvailable(doc) ? documentViewUrl(doc) : null;
  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: BRAND.grayLight,
      }}
    >
      <ContractPreviewPane
        key={doc ? `${doc.id}:${doc.storagePath ?? doc.filename}` : 'empty'}
        url={url}
        label={doc ? documentDisplayName(doc) : 'Deal file'}
        filename={doc?.filename}
        emptyMessage="Select a linked file or add one to preview."
        onOpenFull={
          url && doc
            ? () =>
                openDocumentViewer({
                  url,
                  title: documentDisplayName(doc),
                  filename: doc.filename,
                })
            : undefined
        }
      />
    </div>
  );
}

const deleteBtnStyle: CSSProperties = {
  fontSize: 11,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #FECACA',
  background: '#FEF2F2',
  color: BRAND.red,
  fontWeight: 600,
  cursor: 'pointer',
};
