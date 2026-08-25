'use client';

import { useEffect, useRef, useState } from 'react';
import {
  updateContractSubmitActionLink,
  type ContractDealStage,
  type ContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';

type EditableContractLinkProps = {
  action: Pick<
    ContractSubmitActionRow,
    'id' | 'status' | 'contract_url' | 'contract_storage_path' | 'contract_filename'
  >;
  onSaved?: (next: ContractSubmitActionRow, meta?: { advanced?: boolean }) => void;
  /** Compact layout for ticket side panels */
  compact?: boolean;
  /**
   * When true (quote accepted / awaiting supplier), allow skipping supplier email
   * once a link or file is attached.
   */
  allowBypassSupplier?: boolean;
  onBypassSupplier?: () => void | Promise<void>;
  bypassBusy?: boolean;
};

export function EditableContractLink({
  action,
  onSaved,
  compact = false,
  allowBypassSupplier = false,
  onBypassSupplier,
  bypassBusy = false,
}: EditableContractLinkProps) {
  const [draftUrl, setDraftUrl] = useState(action.contract_url ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftUrl(action.contract_url ?? '');
    setError('');
    setSavedFlash(false);
  }, [action.id, action.contract_url]);

  const dirty = draftUrl.trim() !== (action.contract_url ?? '').trim();
  const hasContract = Boolean(
    action.contract_storage_path?.trim() ||
      draftUrl.trim() ||
      action.contract_url?.trim(),
  );
  const openHref = action.contract_storage_path
    ? `/api/admin/contract-submit-actions/${action.id}/contract`
    : draftUrl.trim() || action.contract_url || null;

  const canBypass =
    allowBypassSupplier &&
    hasContract &&
    (action.status === 'quote_accepted' || action.status === 'supplier_contract_requested');

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError('');
    setSavedFlash(false);
    try {
      const trimmed = draftUrl.trim();
      const next = await updateContractSubmitActionLink(action.id, {
        contractUrl: trimmed || null,
        contractFilename:
          trimmed && !action.contract_filename
            ? 'Contract link'
            : !trimmed && action.contract_filename === 'Contract link'
              ? null
              : undefined,
      });
      if (!next) {
        setError('Could not save contract link. Try again.');
        return;
      }
      setDraftUrl(next.contract_url ?? '');
      setSavedFlash(true);
      onSaved?.(next);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File, advance: boolean) => {
    if (uploading) return;
    setUploading(true);
    setError('');
    setSavedFlash(false);
    try {
      const form = new FormData();
      form.set('file', file);
      if (advance) form.set('advance', '1');
      const res = await fetch(`/api/admin/contract-submit-actions/${action.id}/contract`, {
        method: 'POST',
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        action?: ContractSubmitActionRow;
        advanced?: boolean;
      };
      if (!res.ok || !data.action) {
        setError(data.error ?? 'Upload failed');
        return;
      }
      setDraftUrl(data.action.contract_url ?? '');
      setSavedFlash(true);
      onSaved?.(data.action, { advanced: data.advanced });
      window.setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div
      style={
        compact
          ? undefined
          : {
              marginTop: 14,
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--gray-border)',
              background: 'var(--surface-muted, #f8fafc)',
            }
      }
    >
      <div className="ticket-detail-field-label" style={{ marginBottom: 6 }}>
        Supplier contract
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          type="url"
          value={draftUrl}
          onChange={(e) => {
            setDraftUrl(e.target.value);
            setError('');
            setSavedFlash(false);
          }}
          placeholder="https://… paste a contract link"
          disabled={saving || uploading}
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid var(--gray-border)',
            fontSize: 13,
            fontFamily: 'inherit',
            background: '#fff',
          }}
        />
        <button
          type="button"
          className="admin-ticket-btn primary"
          disabled={saving || uploading || !dirty}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save link'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file, false);
          }}
        />
        <button
          type="button"
          className="admin-ticket-btn"
          disabled={saving || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'Uploading…' : 'Upload file'}
        </button>
        {openHref ? (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-ticket-btn"
            style={{ textDecoration: 'none' }}
          >
            Open
          </a>
        ) : null}
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gray)' }}>
        Paste a shareable link and/or upload a PDF/DOC. If you already have the contract, skip
        emailing the supplier below.
      </div>
      {action.contract_filename && !compact ? (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--gray-dark)' }}>
          {action.contract_storage_path ? 'File: ' : 'Label: '}
          {action.contract_filename}
        </div>
      ) : null}
      {canBypass && onBypassSupplier ? (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="admin-ticket-btn primary"
            disabled={bypassBusy || saving || uploading || dirty}
            title={dirty ? 'Save the link first' : undefined}
            onClick={() => void onBypassSupplier()}
          >
            {bypassBusy
              ? 'Continuing…'
              : action.status === 'quote_accepted'
                ? 'Use this contract — skip supplier request'
                : 'Mark contract received'}
          </button>
          {dirty ? (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--amber)' }}>
              Save the link first, then continue.
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>{error}</div>
      ) : null}
      {savedFlash ? (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--green)' }}>
          Contract saved
        </div>
      ) : null}
    </div>
  );
}

/** Stages where attaching a contract can skip the supplier email step. */
export function canAttachContractBypassSupplier(status: ContractDealStage): boolean {
  return status === 'quote_accepted' || status === 'supplier_contract_requested';
}
