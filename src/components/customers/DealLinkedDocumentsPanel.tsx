'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
import { parseContractDocumentFromStorage } from '@/lib/contract-document-extract';
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

export type ReparseFieldKey =
  | 'solution'
  | 'product'
  | 'service'
  | 'paySource'
  | 'dealId'
  | 'solutionDescription'
  | 'contractStartDate'
  | 'contractEndDate'
  | 'contractTerms'
  | 'mrr'
  | 'mrc'
  | 'estimatedTotalBill'
  | 'pricingLineItems';

export const REPARSE_FIELD_LABEL: Record<ReparseFieldKey, string> = {
  solution: 'Provider',
  product: 'Product',
  service: 'Service label',
  paySource: 'Pay source',
  dealId: 'Deal ID',
  solutionDescription: 'Description',
  contractStartDate: 'Contract start',
  contractEndDate: 'Contract end',
  contractTerms: 'Contract terms',
  mrr: 'MRR',
  mrc: 'MRC',
  estimatedTotalBill: 'Estimated total bill',
  pricingLineItems: 'Pricing rows',
};

const ADD_KIND_OPTIONS: { value: RecordKind; label: string }[] = [
  { value: 'candid_contract', label: 'Contract' },
  { value: 'proposal', label: 'Proposal / quote' },
  { value: 'external_contract', label: 'External contract' },
  { value: 'other', label: 'Other / onboarding' },
];

type Props = {
  contract: CandidContractRecord;
  documents: CustomerDocument[];
  /** Account contracts — used to name the contract a document is already linked to. */
  contracts?: CandidContractRecord[];
  onDocumentsChange?: (next: CustomerDocument[]) => void;
  onReparseBlanks?: (partial: Partial<CandidContractRecord>) => void;
  /** Unsaved form values; Reparse treats these as the source of truth for "blank". */
  currentValues?: Partial<CandidContractRecord>;
  /**
   * - column: full right-pane UI (accordion + preview header actions + footer add/link)
   * - inline: compact nested list with preview under row (account detail)
   */
  variant?: 'column' | 'inline';
};

/**
 * CR-0050 — Deal files live on the right: accordion tabs, actions in the preview
 * header, link/add controls at the bottom.
 */
export function DealLinkedDocumentsPanel({
  contract,
  documents,
  contracts = [],
  onDocumentsChange,
  onReparseBlanks,
  currentValues,
  variant = 'column',
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
      documents
        .filter((d) => d.customerId === contract.customerId && d.contractId !== contract.id)
        .sort((a, b) => Number(!a.storagePath) - Number(!b.storagePath)),
    [documents, contract.customerId, contract.id],
  );
  const linkedContractLabel = (contractId: string): string => {
    const other = contracts.find((ct) => ct.id === contractId);
    const label = other
      ? [other.solution || other.vendor, other.product || other.service].filter(Boolean).join(' – ')
      : '';
    return label ? `linked to: ${label}` : 'linked to another contract';
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<RecordKind>('candid_contract');
  const [linkDocId, setLinkDocId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'info' | 'success' | 'error'>('info');
  const [reparsingId, setReparsingId] = useState<string | null>(null);
  const showNotice = (msg: string | null, tone: 'info' | 'success' | 'error' = 'info') => {
    setNotice(msg);
    setNoticeTone(tone);
  };
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addModeRef = useRef<'add' | 'replace'>('add');
  const replaceTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (linked.length === 0) {
      if (selectedId != null) setSelectedId(null);
      return;
    }
    if (selectedId && linked.some((d) => d.id === selectedId)) return;
    setSelectedId(primary?.id ?? linked[0]?.id ?? null);
  }, [linked, primary?.id, selectedId]);

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
    showNotice(null);
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
        showNotice(`Updated: ${documentDisplayName(saved)}`);
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
        showNotice(`Linked: ${documentDisplayName(saved)}`);
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      replaceTargetRef.current = null;
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleLinkExisting = async () => {
    const doc = documents.find((d) => d.id === linkDocId);
    if (!doc) return;
    if (doc.contractId === contract.id) {
      setSelectedId(doc.id);
      setLinkDocId('');
      showNotice('That file is already linked to this contract.');
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
      showNotice('A copy of that file is already linked to this contract.');
      return;
    }
    setBusy(true);
    showNotice(null);
    try {
      const next: CustomerDocument = { ...doc, contractId: contract.id };
      await updateCrmDocument(contract.customerId, next);
      onDocumentsChange?.(documents.map((d) => (d.id === doc.id ? next : d)));
      setSelectedId(doc.id);
      setLinkDocId('');
      showNotice(
        next.storagePath
          ? `Linked ${documentDisplayName(doc)} to this contract.`
          : `Linked ${documentDisplayName(doc)} — file bytes are missing; use Replace to upload the PDF.`,
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Link failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (doc: CustomerDocument) => {
    setBusy(true);
    showNotice(null);
    try {
      const { contractId: _cleared, ...rest } = doc;
      const next: CustomerDocument = { ...rest };
      await updateCrmDocument(contract.customerId, next);
      onDocumentsChange?.(documents.map((d) => (d.id === doc.id ? next : d)));
      showNotice(`Unlinked ${documentDisplayName(doc)} (file kept on account).`);
      if (selectedId === doc.id) {
        setSelectedId(linked.filter((d) => d.id !== doc.id)[0]?.id ?? null);
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unlink failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (doc: CustomerDocument) => {
    setBusy(true);
    showNotice(null);
    try {
      await deleteCrmDocument(contract.customerId, doc.id);
      onDocumentsChange?.(documents.filter((d) => d.id !== doc.id));
      showNotice('File deleted. The deal was kept.');
      setConfirmDeleteId(null);
      if (selectedId === doc.id) {
        setSelectedId(linked.filter((d) => d.id !== doc.id)[0]?.id ?? null);
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Delete failed');
      setConfirmDeleteId(null);
    } finally {
      setBusy(false);
    }
  };

  const handleChangeKind = async (doc: CustomerDocument, kind: RecordKind) => {
    if (doc.recordKind === kind) return;
    setBusy(true);
    showNotice(null);
    try {
      const next: CustomerDocument = { ...doc, recordKind: kind };
      await updateCrmDocument(contract.customerId, next);
      onDocumentsChange?.(documents.map((d) => (d.id === doc.id ? next : d)));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Could not update type');
    } finally {
      setBusy(false);
    }
  };

  const handleReparse = async (doc: CustomerDocument) => {
    if (!onReparseBlanks) return;
    if (!doc.storagePath) {
      showNotice('No file bytes available to reparse — use Replace to upload first.', 'error');
      return;
    }
    setBusy(true);
    setReparsingId(doc.id);
    showNotice(
      `Reparsing ${documentDisplayName(doc)} — reading the contract with AI. This can take 10–30 seconds…`,
    );
    try {
      const extract = await parseContractDocumentFromStorage(
        doc.storagePath,
        doc.filename || 'contract.pdf',
      );
      const base = { ...contract, ...currentValues };
      const currentForm = candidContractFormFromRecord(base);
      const merged = applyContractExtractToForm(currentForm, extract);
      const blankFill: Partial<CandidContractRecord> = {};
      const filled: ReparseFieldKey[] = [];
      const textKeys = [
        'solution',
        'product',
        'service',
        'paySource',
        'dealId',
        'solutionDescription',
        'contractStartDate',
        'contractEndDate',
        'contractTerms',
      ] as const;
      for (const key of textKeys) {
        const next = merged[key];
        if (!currentForm[key].trim() && next.trim()) {
          (blankFill as Record<string, unknown>)[key] = next.trim();
          filled.push(key);
        }
      }
      const numKeys = ['mrr', 'mrc', 'estimatedTotalBill'] as const;
      for (const key of numKeys) {
        if (currentForm[key].trim() || !merged[key].trim()) continue;
        const n = Number(merged[key]);
        if (!Number.isFinite(n)) continue;
        blankFill[key] = n;
        filled.push(key);
      }
      if (blankFill.mrr != null && base.monthly == null) blankFill.monthly = blankFill.mrr;
      if (!currentForm.pricingLineItems.length && merged.pricingLineItems.length) {
        blankFill.pricingLineItems = merged.pricingLineItems;
        filled.push('pricingLineItems');
      }
      onReparseBlanks(blankFill);
      const partialNote = extract?.partial
        ? ' The document was too long to read completely — check the remaining fields manually.'
        : '';
      if (filled.length) {
        showNotice(
          `Reparse filled ${filled.length} blank field${filled.length === 1 ? '' : 's'}: ${filled
            .map((k) => REPARSE_FIELD_LABEL[k])
            .join(', ')}. Existing values were not changed.${partialNote}`,
          'success',
        );
      } else {
        showNotice(
          (extract
            ? 'Reparse finished — every field the document covers is already filled, so nothing changed.'
            : 'Reparse finished — no contract details could be read from this document.') + partialNote,
        );
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Reparse failed', 'error');
    } finally {
      setBusy(false);
      setReparsingId(null);
    }
  };

  const isContractKind = (kind: RecordKind) =>
    kind === 'candid_contract' || kind === 'external_contract';

  const hasBytes = Boolean(selectedDoc?.storagePath);
  const selectedUrl =
    selectedDoc && isCustomerDocumentAvailable(selectedDoc)
      ? documentViewUrl(selectedDoc)
      : null;
  // Prefer real storage URLs; avoid iframe of "File missing" JSON when no bytes.
  const previewUrl = hasBytes ? selectedUrl : null;

  const footerControls = (
    <div
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '10px 12px',
        borderTop: `1px solid ${BRAND.grayBorder}`,
        background: BRAND.white,
        flexShrink: 0,
      }}
    >
      <select
        value={linkDocId}
        onChange={(e) => setLinkDocId(e.target.value)}
        style={selectStyle}
        aria-label="Link existing document"
      >
        <option value="">Link existing document…</option>
        {unlinked.map((d) => (
          <option key={d.id} value={d.id}>
            {documentDisplayName(d)}
            {d.contractId ? ` — ${linkedContractLabel(d.contractId)}` : ''}
            {!d.storagePath ? ' · no file uploaded' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn-secondary"
        style={btnStyle}
        disabled={busy || !linkDocId}
        onClick={() => void handleLinkExisting()}
      >
        Link
      </button>
      <select
        value={addKind}
        onChange={(e) => setAddKind(e.target.value as RecordKind)}
        style={selectStyle}
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
        style={btnStyle}
        onClick={() => {
          addModeRef.current = 'add';
          replaceTargetRef.current = null;
          fileRef.current?.click();
        }}
      >
        {busy ? 'Working…' : '+ Add file'}
      </button>
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

  const toneStyle: Record<typeof noticeTone, CSSProperties> = {
    info: { background: '#EEF4FF', borderColor: '#B9CCF5', color: '#1F3F7A' },
    success: { background: '#FDECEA', borderColor: BRAND.red, color: BRAND.red },
    error: { background: '#FFF4E5', borderColor: '#E0A040', color: '#8A4B00' },
  };
  const statusBanner = notice ? (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid',
        ...toneStyle[noticeTone],
      }}
    >
      <span style={{ flex: 1 }}>{notice}</span>
      {!reparsingId ? (
        <button
          type="button"
          onClick={() => showNotice(null)}
          aria-label="Dismiss"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  ) : null;

  const headerActionsFor = (doc: CustomerDocument): ReactNode => {
    const available = Boolean(doc.storagePath);
    const url = available ? documentViewUrl(doc) : null;
    return (
      <>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="assist-mini-btn"
            style={{ textDecoration: 'none', fontSize: 11 }}
          >
            Open
          </a>
        ) : null}
        {url ? (
          <button
            type="button"
            className="assist-mini-btn"
            onClick={() =>
              openDocumentViewer({
                url,
                title: documentDisplayName(doc),
                filename: doc.filename,
              })
            }
          >
            Expand
          </button>
        ) : null}
        <select
          value={doc.recordKind}
          disabled={busy}
          onChange={(e) => void handleChangeKind(doc, e.target.value as RecordKind)}
          style={{ ...selectStyle, padding: '3px 6px', fontSize: 10 }}
          aria-label="Document type"
          title="Document type"
        >
          {ADD_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="assist-mini-btn"
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
          className="assist-mini-btn"
          disabled={busy}
          onClick={() => void handleUnlink(doc)}
        >
          Unlink
        </button>
        {isContractKind(doc.recordKind) && onReparseBlanks ? (
          <button
            type="button"
            className="assist-mini-btn"
            disabled={busy || !available}
            onClick={() => void handleReparse(doc)}
            title="Fill blank contract fields only — never overrides existing values"
            style={reparsingId === doc.id ? { color: BRAND.red, fontWeight: 700 } : undefined}
          >
            {reparsingId === doc.id ? 'Reparsing…' : 'Reparse'}
          </button>
        ) : null}
        {confirmDeleteId === doc.id ? (
          <>
            <button
              type="button"
              className="assist-mini-btn"
              onClick={() => setConfirmDeleteId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              style={{ ...btnStyle, ...deleteBtnStyle }}
              disabled={busy}
              onClick={() => void handleDelete(doc)}
            >
              Confirm delete
            </button>
          </>
        ) : (
          <button
            type="button"
            style={{ ...btnStyle, ...deleteBtnStyle }}
            disabled={busy}
            onClick={() => setConfirmDeleteId(doc.id)}
          >
            Delete
          </button>
        )}
      </>
    );
  };

  if (variant === 'inline') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.grayDark }}>
          Deal files ({linked.length})
        </div>
        {statusBanner}
        {linked.length === 0 ? (
          <p style={{ fontSize: 12, color: BRAND.gray, margin: 0 }}>No files linked yet.</p>
        ) : (
          linked.map((doc) => {
            const selected = doc.id === selectedId;
            const url = doc.storagePath ? documentViewUrl(doc) : null;
            return (
              <div
                key={doc.id}
                style={{
                  border: `1px solid ${BRAND.grayBorder}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: BRAND.white,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(doc.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: selected ? 'rgba(200,40,30,0.04)' : BRAND.white,
                    padding: '8px 10px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>
                    {selected ? '▾ ' : '▸ '}
                    {documentDisplayName(doc)}
                  </div>
                  <div style={{ fontSize: 10, color: BRAND.gray }}>
                    {recordKindLabel(doc.recordKind)}
                    {!doc.storagePath ? ' · file missing' : ''}
                  </div>
                </button>
                {selected ? (
                  <ContractPreviewPane
                    key={`${doc.id}:${doc.storagePath ?? 'none'}`}
                    url={url}
                    label={documentDisplayName(doc)}
                    filename={doc.filename}
                    compact
                    headerActions={headerActionsFor(doc)}
                    emptyMessage={
                      doc.storagePath
                        ? 'Could not load preview.'
                        : 'File bytes are missing. Use Replace to upload the PDF.'
                    }
                  />
                ) : null}
              </div>
            );
          })
        )}
        {footerControls}
      </div>
    );
  }

  // —— column variant (edit contract right pane) ——
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
      <div
        style={{
          padding: '10px 12px 0',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.gray, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Deal files ({linked.length})
        </div>
        {statusBanner}
        {linked.map((doc) => {
          const selected = doc.id === selectedId;
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelectedId(doc.id)}
              style={{
                textAlign: 'left',
                border: `1px solid ${selected ? BRAND.red : BRAND.grayBorder}`,
                borderRadius: 8,
                background: selected ? BRAND.white : BRAND.grayLight,
                padding: '8px 10px',
                cursor: 'pointer',
                boxShadow: selected ? '0 1px 0 rgba(200,40,30,0.12)' : 'none',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.grayDark }}>
                {selected ? '▾ ' : '▸ '}
                {documentDisplayName(doc)}
              </div>
              <div style={{ fontSize: 10, color: BRAND.gray, marginTop: 2 }}>
                {recordKindLabel(doc.recordKind)}
                {!doc.storagePath ? ' · file missing — replace to upload' : ''}
              </div>
            </button>
          );
        })}
        {linked.length === 0 ? (
          <p style={{ fontSize: 12, color: BRAND.gray, margin: '8px 0' }}>
            No files linked yet. Use the controls below to link or upload.
          </p>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        {selectedDoc ? (
          <ContractPreviewPane
            key={`${selectedDoc.id}:${selectedDoc.storagePath ?? 'none'}`}
            url={previewUrl}
            label={documentDisplayName(selectedDoc)}
            filename={selectedDoc.filename}
            headerActions={headerActionsFor(selectedDoc)}
            hideDefaultOpenExpand
            emptyMessage={
              hasBytes
                ? 'Could not load preview.'
                : 'File bytes are missing for this record. Use Replace in the header to upload the PDF.'
            }
            onOpenFull={
              previewUrl
                ? () =>
                    openDocumentViewer({
                      url: previewUrl,
                      title: documentDisplayName(selectedDoc),
                      filename: selectedDoc.filename,
                    })
                : undefined
            }
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              fontSize: 13,
              color: BRAND.gray,
              padding: 24,
              textAlign: 'center',
            }}
          >
            Link or add a file to preview it here.
          </div>
        )}
      </div>

      {footerControls}
    </div>
  );
}

const selectStyle: CSSProperties = {
  fontSize: 11,
  padding: '5px 8px',
  borderRadius: 6,
  border: `1px solid ${BRAND.grayBorder}`,
  background: BRAND.white,
  maxWidth: 200,
};

const btnStyle: CSSProperties = {
  fontSize: 11,
  padding: '5px 10px',
  borderRadius: 6,
  cursor: 'pointer',
};

const deleteBtnStyle: CSSProperties = {
  border: '1px solid #FECACA',
  background: '#FEF2F2',
  color: BRAND.red,
  fontWeight: 600,
};
