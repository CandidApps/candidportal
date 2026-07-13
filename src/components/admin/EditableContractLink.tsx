'use client';

import { useEffect, useState } from 'react';
import {
  updateContractSubmitActionLink,
  type ContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';

type EditableContractLinkProps = {
  action: Pick<
    ContractSubmitActionRow,
    'id' | 'contract_url' | 'contract_storage_path' | 'contract_filename'
  >;
  onSaved?: (next: ContractSubmitActionRow) => void;
  /** Compact layout for ticket side panels */
  compact?: boolean;
};

export function EditableContractLink({
  action,
  onSaved,
  compact = false,
}: EditableContractLinkProps) {
  const [draftUrl, setDraftUrl] = useState(action.contract_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraftUrl(action.contract_url ?? '');
    setError('');
    setSavedFlash(false);
  }, [action.id, action.contract_url]);

  const dirty = draftUrl.trim() !== (action.contract_url ?? '').trim();
  const openHref = action.contract_storage_path
    ? `/api/admin/contract-submit-actions/${action.id}/contract`
    : draftUrl.trim() || action.contract_url || null;

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
        Contract link
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
          placeholder="https://… (paste or correct the contract URL)"
          disabled={saving}
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
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save link'}
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
        {action.contract_storage_path
          ? 'File also stored on this deal — you can still set/correct the shareable link used in emails.'
          : 'Edit if auto-import picked the wrong URL or the supplier sends an updated link.'}
      </div>
      {action.contract_filename && !compact ? (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--gray-dark)' }}>
          Label: {action.contract_filename}
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>{error}</div>
      ) : null}
      {savedFlash ? (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--green)' }}>Link saved</div>
      ) : null}
    </div>
  );
}
