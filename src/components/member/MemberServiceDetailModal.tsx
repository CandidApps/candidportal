'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { ContractPreviewPane } from '@/components/shared/ContractPreviewPane';
import type { ServiceCardModel } from '@/lib/services/account-services';
import { isCandidServiceInRenewalWindow } from '@/lib/services/account-services';
import { formatSavingsMoney, quoteSavingsPreview } from '@/lib/services/quote-savings';
import { computeServiceSavingsDisplay } from '@/lib/services/service-savings';
import { signedServiceDocumentUrl } from '@/lib/services/external-member-services';
import { openDocumentViewer } from '@/lib/document-viewer';
import { formatMoney } from '@/lib/pricing-line-items';

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
  const [docLoading, setDocLoading] = useState(Boolean(service.documentUrl || service.contractStoragePath));
  const [narrow, setNarrow] = useState(false);
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
    setVendorName(service.name);
  }, [service.id, service.name]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    void (async () => {
      setDocLoading(true);
      try {
        if (service.documentUrl) {
          setAgreementUrl(service.documentUrl);
          return;
        }
        if (service.contractStoragePath) {
          setAgreementUrl(await signedServiceDocumentUrl(service.contractStoragePath));
          return;
        }
        setAgreementUrl(null);
      } finally {
        setDocLoading(false);
      }
    })();
  }, [service.contractStoragePath, service.documentUrl]);

  const start = formatDate(service.contractStartDate);
  const end = formatDate(service.contractEndDate);
  const docLabel =
    service.documentFilename ?? service.contractFilename ?? `${service.name} agreement`;
  // Always reserve the contract pane for Candid-managed services (and any service with a file).
  const showDocPane = Boolean(
    service.candidManaged ||
      service.documentUrl ||
      service.contractStoragePath ||
      service.documentFilename ||
      service.contractFilename ||
      agreementUrl ||
      docLoading,
  );

  const openAgreement = () => {
    if (!agreementUrl) return;
    openDocumentViewer({
      url: agreementUrl,
      title: docLabel,
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
      style={{ alignItems: 'center', padding: '16px 12px' }}
    >
      <div
        className="modal-box"
        style={{
          width: showDocPane ? 1100 : 520,
          maxWidth: '96vw',
          maxHeight: 'min(92vh, 920px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
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
              <div className="modal-title" style={{ overflowWrap: 'anywhere' }}>
                {service.productName || service.name}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, overflowWrap: 'anywhere' }}>
              {[service.serviceCategory, service.vendor].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {inRenewalWindow && onRenewNow ? (
              <button
                type="button"
                className="svc-detail-header-btn"
                onClick={() => {
                  onClose();
                  onRenewNow(service);
                }}
              >
                Renew now
              </button>
            ) : (
              <button
                type="button"
                className="svc-detail-header-btn"
                onClick={() => onGetHelp(service)}
              >
                Get help
              </button>
            )}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              showDocPane && !narrow ? 'minmax(280px, 1fr) minmax(320px, 1.15fr)' : '1fr',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div
            className="modal-body"
            style={{
              padding: '24px 28px',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              minHeight: 0,
              maxHeight: showDocPane && narrow ? '42vh' : undefined,
              borderRight: showDocPane && !narrow ? '1px solid var(--gray-border)' : undefined,
              borderBottom: showDocPane && narrow ? '1px solid var(--gray-border)' : undefined,
            }}
          >
            <div style={{ display: 'grid', gap: 14 }}>
              {service.serviceCategory ? (
                <DetailRow label="Service" value={service.serviceCategory} />
              ) : null}
              {(service.productName || service.name) && (
                <DetailRow label="Product" value={service.productName || service.name} />
              )}
              {service.serviceDescription && (
                <DetailRow label="Description" value={service.serviceDescription} />
              )}
              {(service.pricingLineItems?.length ?? 0) > 0 ? (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--gray)',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    Pricing
                  </div>
                  <div
                    style={{
                      border: '1px solid var(--gray-border)',
                      borderRadius: 8,
                      overflowX: 'auto',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 0.7fr 1fr',
                        gap: 8,
                        padding: '8px 10px',
                        background: 'var(--surface-muted, #f8fafc)',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'var(--gray)',
                      }}
                    >
                      <span>Service</span>
                      <span>Cost</span>
                      <span>Qty</span>
                      <span>Monthly</span>
                    </div>
                    {service.pricingLineItems!.map((row) => (
                      <div
                        key={row.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 0.7fr 1fr',
                          gap: 8,
                          padding: '8px 10px',
                          borderTop: '1px solid var(--gray-border)',
                          fontSize: 13,
                          color: 'var(--gray-dark)',
                        }}
                      >
                        <span>{row.service}</span>
                        <span>{formatMoney(row.cost)}</span>
                        <span>{row.quantity}</span>
                        <span>{formatMoney(row.monthlyTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {service.userCount != null && service.userCount > 0 && (
                <DetailRow label="Users / licenses" value={String(service.userCount)} />
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
              {(service.amountBeforeTax || service.amount) && (
                <DetailRow
                  label="Monthly cost before tax"
                  value={`${service.amountBeforeTax || service.amount} / month`}
                />
              )}
              {service.taxEstimate ? (
                <DetailRow label="Tax estimate" value={`${service.taxEstimate} / month`} />
              ) : null}
              {service.estimatedTotalBill ? (
                <DetailRow
                  label="Estimated total bill"
                  value={`${service.estimatedTotalBill} / month`}
                />
              ) : null}
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
              {service.expTxt && (
                <DetailRow
                  label="Renewal"
                  value={[service.expTxt, service.expSub].filter(Boolean).join(' — ')}
                />
              )}
              {service.renewalTerms && (
                <DetailRow label="Renewal terms" value={service.renewalTerms} />
              )}
              {service.interestedInAlternatives && (
                <DetailRow label="Alternatives" value="Interested in options at renewal" />
              )}
            </div>

            {saveError && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 12 }}>{saveError}</p>
            )}

            {(onEditExternal ||
              (canEditVendorName && onRenameVendor && !onEditExternal) ||
              (inRenewalWindow && onRequestNewQuote)) && (
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
              </div>
            )}
          </div>

          {showDocPane ? (
            <ContractPreviewPane
              url={agreementUrl}
              loading={docLoading}
              label={docLabel}
              filename={service.documentFilename ?? service.contractFilename}
              onOpenFull={openAgreement}
              compact={narrow}
            />
          ) : null}
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
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--gray)',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: 'var(--gray-dark)',
          lineHeight: 1.45,
          overflowWrap: 'anywhere',
          whiteSpace: 'pre-wrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}
