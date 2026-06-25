'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { AnalyzingDotsLabel } from '@/components/AnalyzingDotsLabel';
import {
  EMPTY_EXTERNAL_SERVICE_DRAFT,
  extractExternalServiceFromFile,
  draftFromServiceCard,
  type ExternalServiceDraft,
} from '@/lib/external-service-extract';
import {
  saveExternalMemberService,
  signedServiceDocumentUrl,
} from '@/lib/services/external-member-services';
import type { ServiceCardModel } from '@/lib/services/account-services';

type Props = {
  userId: string;
  service?: ServiceCardModel | null;
  crmCustomerId?: string | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--white)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--gray)',
  textTransform: 'uppercase',
  marginBottom: 6,
};

export function ExternalServiceModal({ userId, service, crmCustomerId, onClose, onSaved }: Props) {
  const isEdit = Boolean(service);
  const [draft, setDraft] = useState<ExternalServiceDraft>(() =>
    service ? draftFromServiceCard(service) : EMPTY_EXTERNAL_SERVICE_DRAFT,
  );
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [contractUrl, setContractUrl] = useState<string | null>(null);
  const [billUrl, setBillUrl] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      if (service?.contractStoragePath) {
        setContractUrl(await signedServiceDocumentUrl(service.contractStoragePath));
      }
      if (service?.billStoragePath) {
        setBillUrl(await signedServiceDocumentUrl(service.billStoragePath));
      }
    })();
  }, [service?.billStoragePath, service?.contractStoragePath]);

  const setField = <K extends keyof ExternalServiceDraft>(key: K, value: ExternalServiceDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpload = useCallback(
    async (file: File) => {
      setError('');
      setExtracting(true);
      try {
        const next = await extractExternalServiceFromFile(file, draft);
        setDraft(next);
        const name = file.name.toLowerCase();
        if (/invoice|bill|statement|receipt/.test(name)) {
          setBillFile(file);
        } else {
          setContractFile(file);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read this file');
      } finally {
        setExtracting(false);
      }
    },
    [draft],
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleUpload(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  };

  const save = async () => {
    if (!draft.supplierName.trim() && !draft.serviceName.trim()) {
      setError('Enter a supplier or service name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveExternalMemberService({
        userId,
        draft,
        serviceId: service?.id,
        contractFile,
        billFile,
        crmCustomerId,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save service');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box external-service-modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {isEdit ? 'Edit service not with Candid' : 'Add service not with Candid'}
            </div>
            <div className="modal-subtitle">
              Upload a contract or bill to pre-fill details, or enter everything manually.
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body external-service-modal-body">
          <div
            className="external-service-upload"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => uploadInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') uploadInputRef.current?.click();
            }}
          >
            <input
              ref={uploadInputRef}
              type="file"
              accept=".pdf,image/*"
              className="external-service-file-input"
              onChange={onFileInput}
            />
            <AppIcon name="file" size={22} />
            <div className="external-service-upload-title">
              {extracting ? <AnalyzingDotsLabel prefix="Reading document" /> : 'Drop contract or bill here'}
            </div>
            <div className="external-service-upload-hint">PDF or image — we&apos;ll extract supplier, term, and cost when possible</div>
          </div>

          {(contractFile || billFile || contractUrl || billUrl) && (
            <div className="external-service-files">
              {contractFile ? <span>Contract: {contractFile.name}</span> : null}
              {!contractFile && contractUrl ? (
                <a href={contractUrl} target="_blank" rel="noopener noreferrer">
                  View contract on file
                </a>
              ) : null}
              {billFile ? <span>Bill: {billFile.name}</span> : null}
              {!billFile && billUrl ? (
                <a href={billUrl} target="_blank" rel="noopener noreferrer">
                  View bill on file
                </a>
              ) : null}
            </div>
          )}

          <div className="external-service-form-grid">
            <label>
              <span style={labelStyle}>Supplier / vendor</span>
              <input
                type="text"
                value={draft.supplierName}
                onChange={(e) => setField('supplierName', e.target.value)}
                placeholder="e.g. RingCentral, Comcast Business"
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Service / product</span>
              <input
                type="text"
                value={draft.serviceName}
                onChange={(e) => setField('serviceName', e.target.value)}
                placeholder="e.g. UCaaS, Internet 500 Mbps"
                style={inputStyle}
              />
            </label>
            <label className="external-service-span-2">
              <span style={labelStyle}>Service details</span>
              <textarea
                value={draft.serviceDescription}
                onChange={(e) => setField('serviceDescription', e.target.value)}
                placeholder="Plans, speeds, features, locations…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </label>
            <label>
              <span style={labelStyle}>Number of users / licenses</span>
              <input
                type="text"
                inputMode="numeric"
                value={draft.userCount}
                onChange={(e) => setField('userCount', e.target.value)}
                placeholder="e.g. 25"
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Monthly cost</span>
              <input
                type="text"
                inputMode="decimal"
                value={draft.monthlyAmount}
                onChange={(e) => setField('monthlyAmount', e.target.value)}
                placeholder="e.g. 1250"
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Contract start</span>
              <input
                type="date"
                value={draft.contractStartDate}
                onChange={(e) => setField('contractStartDate', e.target.value)}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Contract expiration</span>
              <input
                type="date"
                value={draft.contractEndDate}
                onChange={(e) => setField('contractEndDate', e.target.value)}
                style={inputStyle}
              />
            </label>
            <label className="external-service-span-2">
              <span style={labelStyle}>Renewal terms</span>
              <input
                type="text"
                value={draft.renewalTerms}
                onChange={(e) => setField('renewalTerms', e.target.value)}
                placeholder="e.g. Auto-renews annually, 60-day notice required"
                style={inputStyle}
              />
            </label>
          </div>

          <label className="external-service-checkbox">
            <input
              type="checkbox"
              checked={draft.interestedInAlternatives}
              onChange={(e) => setField('interestedInAlternatives', e.target.checked)}
            />
            <span>
              I&apos;m interested in alternative options when this contract is up for renewal
            </span>
          </label>

          {error ? <p className="external-service-error">{error}</p> : null}

          <div className="external-service-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving || extracting}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add service'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
