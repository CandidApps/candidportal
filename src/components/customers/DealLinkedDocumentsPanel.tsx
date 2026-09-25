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
  showPreview?: boolean;
  compact?: boolean;
};

/**
 * CR-0050 — Full-width accordion of deal-linked files with link-existing dropdown.
 */
export function DealLinkedDocumentsPanel({
  contract,
  documents,
  onDocumentsChange,
  onReparseBlanks,
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
  const unlinked = useMemo(
    () =>
      documents.filter(
        (d) => d.customerId === contract.customerId && d.contractId !== contract.id,
      ),
    [documents, contract.customerId, contract.id],
  );

  const [openId, setOpenId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<RecordKind>('candid_contract');
  const [linkDocId, setLinkDocId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addModeRef = useRef<'add' | 'replace'>('add');
  const replaceTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (openId && linked.some((d) => d.id === openId)) return;
    setOpenId(primary?.id ?? linked[0]?.id ?? null);
  }, [linked, primary, openId]);

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
        setOpenId(saved.id);
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
        setOpenId(saved.id);
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
    setBusy(true);
    setNotice(null);
    try {
      const next: CustomerDocument = { ...doc, contractId: contract.id };
      await updateCrmDocument(contract.customerId, next);
      onDocumentsChange?.(documents.map((d) => (d.id === doc.id ? next : d)));
      setOpenId(doc.id);
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
      if (openId === doc.id) setOpenId(null);
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
      if (openId === doc.id) setOpenId(null);
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
      // Only surface blank-fill deltas as a partial record update
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

  return (
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
              minWidth: 180,
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
            const open = doc.id === openId;
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
                    background: open ? 'rgba(200,40,30,0.04)' : BRAND.white,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : doc.id)}
                    style={{
                      flex: 1,
                      minWidth: 160,
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.grayDark }}>
                      {open ? '▾ ' : '▸ '}
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
                      onClick={() => setOpenId(open ? null : doc.id)}
                    >
                      {open ? 'Collapse' : 'Expand'}
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
                {open && showPreview && (
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
}

const deleteBtnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #FECACA',
  background: '#FEF2F2',
  color: BRAND.red,
  fontWeight: 600,
  cursor: 'pointer',
};
