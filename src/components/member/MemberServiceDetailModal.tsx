'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ServiceCardModel } from '@/lib/services/account-services';

type Props = {
  service: ServiceCardModel;
  onClose: () => void;
  onOpenTicket: (service: ServiceCardModel) => void;
  canEditVendorName?: boolean;
  onRenameVendor?: (serviceId: string, name: string) => Promise<void>;
};

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MemberServiceDetailModal({
  service,
  onClose,
  onOpenTicket,
  canEditVendorName = false,
  onRenameVendor,
}: Props) {
  const [vendorName, setVendorName] = useState(service.name);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const start = formatDate(service.contractStartDate);
  const end = formatDate(service.contractEndDate);

  const saveVendorName = async () => {
    if (!onRenameVendor || !vendorName.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      await onRenameVendor(service.id, vendorName.trim());
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save vendor name');
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
      <div className="modal-box" style={{ width: 520, maxWidth: '95vw' }}>
        <div className="modal-header">
          <div>
            {canEditVendorName ? (
              <label style={{ display: 'block' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase' }}>
                  Vendor / service name
                </span>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 6,
                    border: '1px solid var(--gray-border)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                />
              </label>
            ) : (
              <div className="modal-title">{service.name}</div>
            )}
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{service.vendor}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gap: 14 }}>
            {service.locationLabel && (
              <DetailRow
                label="Location"
                value={
                  <>
                    <strong>{service.locationLabel}</strong>
                    {service.locationAddress ? (
                      <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4, lineHeight: 1.45 }}>
                        {service.locationAddress}
                      </div>
                    ) : null}
                  </>
                }
              />
            )}
            {service.amount && <DetailRow label="Monthly cost" value={`${service.amount} / month`} />}
            <DetailRow label="Status" value={service.statusTxt} />
            {(start || end) && (
              <DetailRow
                label="Contract term"
                value={[start && `Start ${start}`, end && `End ${end}`].filter(Boolean).join(' · ')}
              />
            )}
            {service.expTxt && <DetailRow label="Renewal" value={[service.expTxt, service.expSub].filter(Boolean).join(' — ')} />}
            {service.documentFilename && (
              <DetailRow label="Agreement on file" value={service.documentFilename} />
            )}
          </div>

          {saveError && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 12 }}>{saveError}</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
            {canEditVendorName && onRenameVendor && (
              <button
                type="button"
                className="service-card-action-btn primary"
                disabled={saving || !vendorName.trim()}
                onClick={() => void saveVendorName()}
              >
                {saving ? 'Saving…' : 'Save vendor name'}
              </button>
            )}
            {service.documentUrl ? (
              <a
                href={service.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="service-card-action-btn primary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                View agreement
              </a>
            ) : null}
            <button type="button" className="service-card-action-btn" onClick={() => onOpenTicket(service)}>
              Open ticket
            </button>
            <button type="button" className="service-card-action-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--gray-dark)', lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}
