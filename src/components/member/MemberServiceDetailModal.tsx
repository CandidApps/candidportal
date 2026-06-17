'use client';

import type { ReactNode } from 'react';
import type { ServiceCardModel } from '@/lib/services/account-services';

type Props = {
  service: ServiceCardModel;
  onClose: () => void;
  onOpenTicket: (service: ServiceCardModel) => void;
};

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MemberServiceDetailModal({ service, onClose, onOpenTicket }: Props) {
  const start = formatDate(service.contractStartDate);
  const end = formatDate(service.contractEndDate);

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
            <div className="modal-title">{service.name}</div>
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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
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
            ) : (
              <span
                className="service-card-action-btn"
                style={{ opacity: 0.45, cursor: 'not-allowed' }}
                title="No agreement document is available to view online yet"
              >
                Agreement not available
              </span>
            )}
            <button
              type="button"
              className="service-card-action-btn"
              onClick={() => {
                onClose();
                onOpenTicket(service);
              }}
            >
              Open ticket
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
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--gray)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--gray-dark)', lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}
