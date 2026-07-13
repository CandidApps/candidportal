'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ServiceCardModel } from '@/lib/services/account-services';
import { isCandidServiceInRenewalWindow } from '@/lib/services/account-services';
import { formatSavingsMoney, quoteSavingsPreview } from '@/lib/services/quote-savings';
import { computeServiceSavingsDisplay } from '@/lib/services/service-savings';
import { signedServiceDocumentUrl } from '@/lib/services/external-member-services';
import { openDocumentViewer } from '@/lib/document-viewer';

type Props = {
  service: ServiceCardModel;
  onClose: () => void;
  onGetHelp: (service: ServiceCardModel) => void;
  onRenewNow?: (service: ServiceCardModel) => void;
  onRequestNewQuote?: (service: ServiceCardModel) => void;
  canEditVendorName?: boolean;
  onRenameVendor?: (serviceId: string, name: string) => Promise<void>;
  onEditExternal?: () => void;
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
  onGetHelp,
  onRenewNow,
  onRequestNewQuote,
  canEditVendorName = false,
  onRenameVendor,
  onEditExternal,
}: Props) {
  const [vendorName, setVendorName] = useState(service.name);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [agreementUrl, setAgreementUrl] = useState<string | null>(service.documentUrl ?? null);
  const inRenewalWindow = isCandidServiceInRenewalWindow(service);
  const savingsDisplay =
    computeServiceSavingsDisplay({
      snapshot: service.analysisSnapshot ?? null,
      baseline: service.savingsBaseline ?? null,
      addedSeatCount: service.addedSeatCount ?? 0,
      categoryLabel:
        service.analysisSnapshot?.categoriesLabel ?? service.analysisSnapshot?.categoryLabel ?? null,
    }) ??
    (() => {
      const preview = quoteSavingsPreview(service);
      return preview && preview.monthly > 0
        ? { original: preview, adjusted: null, addedSeatCount: 0 }
        : null;
    })();

  useEffect(() => {
    void (async () => {
      if (service.documentUrl) {
        setAgreementUrl(service.documentUrl);
        return;
      }
      if (service.contractStoragePath) {
        setAgreementUrl(await signedServiceDocumentUrl(service.contractStoragePath));
        return;
      }
      setAgreementUrl(null);
    })();
  }, [service.contractStoragePath, service.documentUrl]);

  const start = formatDate(service.contractStartDate);
  const end = formatDate(service.contractEndDate);

  const openAgreement = () => {
    if (!agreementUrl) return;
    openDocumentViewer({
      url: agreementUrl,
      title: service.documentFilename ?? `${service.name} agreement`,
      filename: service.documentFilename ?? service.contractFilename ?? undefined,
    });
  };

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
            {canEditVendorName && !onEditExternal ? (
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
            {service.serviceDescription && (
              <DetailRow label="Service details" value={service.serviceDescription} />
            )}
            {service.userCount != null && service.userCount > 0 && (
              <DetailRow
                label="Users / licenses"
                value={String(service.userCount)}
              />
            )}
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
            {savingsDisplay && (
              <DetailRow
                label={savingsDisplay.adjusted ? 'Original proposed savings' : 'Proposed savings'}
                value={`${formatSavingsMoney(savingsDisplay.original.monthly)}/mo · ${formatSavingsMoney(savingsDisplay.original.annual)}/yr`}
              />
            )}
            {savingsDisplay?.adjusted && (
              <DetailRow
                label={`Adjusted savings vs old provider${savingsDisplay.addedSeatCount ? ` (+${savingsDisplay.addedSeatCount} added)` : ''}`}
                value={`${formatSavingsMoney(savingsDisplay.adjusted.monthly)}/mo · ${formatSavingsMoney(savingsDisplay.adjusted.annual)}/yr`}
              />
            )}
            <DetailRow label="Status" value={service.statusTxt} />
            {(start || end) && (
              <DetailRow
                label="Contract term"
                value={[start && `Start ${start}`, end && `End ${end}`].filter(Boolean).join(' · ')}
              />
            )}
            {service.expTxt && <DetailRow label="Renewal" value={[service.expTxt, service.expSub].filter(Boolean).join(' — ')} />}
            {service.renewalTerms && <DetailRow label="Renewal terms" value={service.renewalTerms} />}
            {service.interestedInAlternatives && (
              <DetailRow label="Alternatives" value="Interested in options at renewal" />
            )}
          </div>

          {saveError && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 12 }}>{saveError}</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
            {onEditExternal && (
              <button type="button" className="service-card-action-btn primary" onClick={onEditExternal}>
                Edit service
              </button>
            )}
            {canEditVendorName && onRenameVendor && !onEditExternal && (
              <button
                type="button"
                className="service-card-action-btn primary"
                disabled={saving || !vendorName.trim()}
                onClick={() => void saveVendorName()}
              >
                {saving ? 'Saving…' : 'Save vendor name'}
              </button>
            )}
            {agreementUrl ? (
              <button type="button" className="service-card-action-btn primary" onClick={openAgreement}>
                View agreement
              </button>
            ) : null}
            {inRenewalWindow && onRenewNow ? (
              <button
                type="button"
                className="service-card-action-btn primary"
                onClick={() => {
                  onClose();
                  onRenewNow(service);
                }}
              >
                Renew now
              </button>
            ) : (
              <button type="button" className="service-card-action-btn primary" onClick={() => onGetHelp(service)}>
                Get help
              </button>
            )}
            {inRenewalWindow && onRequestNewQuote && (
              <button
                type="button"
                className="service-card-action-btn"
                onClick={() => {
                  onClose();
                  onRequestNewQuote(service);
                }}
              >
                Request new quote
              </button>
            )}
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
