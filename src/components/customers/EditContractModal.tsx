'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBmwAgentRates, resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import {
  DEAL_STATUS_OPTIONS,
  PAY_SOURCE_OPTIONS,
  calcCandidCommissionAmount,
  type CandidContractRecord,
  type CustomerDocument,
  type DealStatus,
  type PricingLineItem,
} from '@/lib/customer-records';
import { setContractOverride } from '@/lib/customer-contract-overrides';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import { syncContractAgentAssignment } from '@/lib/bmw/deal-agent-sync';
import { formatServiceBreakdownLines } from '@/lib/service-breakdown-display';
import {
  estimatedTotalFromTax,
  evaluateSimpleMathExpression,
  pricingLineItemsFromServiceBreakdown,
  sumPricingLineItems,
  sumPricingLineItemsForMrr,
} from '@/lib/pricing-line-items';
import { PricingLineItemsEditor } from '@/components/customers/CandidContractDealFields';
import { ContractPreviewPane } from '@/components/shared/ContractPreviewPane';
import { documentViewUrl, findDocumentForContract } from '@/lib/contract-document-link';
import { isCustomerDocumentAvailable } from '@/lib/crm/document-url';
import { openDocumentViewer } from '@/lib/document-viewer';
import type { Location } from '@/components/CustomersView';
import type { CustomerReminderKind } from '@/lib/customer-reminders/types';

const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${BRAND.grayBorder}`,
  borderRadius: 6,
  padding: '10px 12px',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 13,
  color: BRAND.grayDark,
  outline: 'none',
  boxSizing: 'border-box',
};

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, letterSpacing: '0.06em', marginBottom: 5 }}>
    {children}
  </label>
);

export function EditContractModal({
  contract,
  locations,
  documents = [],
  onClose,
  onSave,
  onDelete,
  onAddReminder,
}: {
  contract: CandidContractRecord;
  locations: Location[];
  documents?: CustomerDocument[];
  onClose: () => void;
  onSave: (updated: CandidContractRecord) => void;
  onDelete: () => void | Promise<void>;
  onAddReminder?: (kind: CustomerReminderKind) => void;
}) {
  const agents = useMemo(
    () =>
      getBmwAgentRates()
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const [dealStatus, setDealStatus] = useState<DealStatus>(contract.dealStatus);
  const [agentCommId, setAgentCommId] = useState(contract.agentCommId ?? '');
  const [agentCommissionRate, setAgentCommissionRate] = useState(
    contract.agentCommissionRate != null ? String(contract.agentCommissionRate) : '',
  );
  const [paySource, setPaySource] = useState(contract.paySource ?? '');
  const [provider, setProvider] = useState(contract.solution ?? '');
  const [dealId, setDealId] = useState(contract.dealId ?? '');
  const [service, setService] = useState(contract.service ?? '');
  const [product, setProduct] = useState(contract.product ?? '');
  const [solutionDescription, setSolutionDescription] = useState(contract.solutionDescription ?? '');
  const [pricingLineItems, setPricingLineItems] = useState<PricingLineItem[]>(
    () =>
      contract.pricingLineItems?.length
        ? contract.pricingLineItems
        : pricingLineItemsFromServiceBreakdown(contract.serviceBreakdown),
  );
  const [mrr, setMrr] = useState(contract.mrr != null ? String(contract.mrr) : '');
  const [mrc, setMrc] = useState(
    contract.mrc != null
      ? String(contract.mrc)
      : contract.monthly != null
        ? String(contract.monthly)
        : '',
  );
  const [taxRatePercent, setTaxRatePercent] = useState(
    contract.taxRatePercent != null ? String(contract.taxRatePercent) : '',
  );
  const [estimatedTotalBill, setEstimatedTotalBill] = useState(
    contract.estimatedTotalBill != null ? String(contract.estimatedTotalBill) : '',
  );
  const [candidCommissionRate, setCandidCommissionRate] = useState(
    contract.candidCommissionRate != null ? String(contract.candidCommissionRate) : '',
  );
  const [spiffExpected, setSpiffExpected] = useState(
    contract.spiffExpected != null ? String(contract.spiffExpected) : '',
  );

  const applyPricingTotals = (nextItems: PricingLineItem[]) => {
    setPricingLineItems(nextItems);
    const mrcTotal = sumPricingLineItems(nextItems);
    const mrrTotal = sumPricingLineItemsForMrr(nextItems);
    if (nextItems.length) {
      setMrc(String(mrcTotal));
      setMrr(String(mrrTotal));
      const taxRate = taxRatePercent.trim() ? Number(taxRatePercent) : NaN;
      if (Number.isFinite(taxRate) && taxRate >= 0) {
        setEstimatedTotalBill(String(estimatedTotalFromTax(mrcTotal, taxRate)));
      }
    }
  };

  const computedCommissionAmount = useMemo(() => {
    const mrrNum = mrr.trim() ? Number(mrr) : undefined;
    const rateNum = candidCommissionRate.trim() ? Number(candidCommissionRate) : undefined;
    if (mrrNum == null || rateNum == null || !Number.isFinite(mrrNum) || !Number.isFinite(rateNum)) {
      return undefined;
    }
    return calcCandidCommissionAmount(mrrNum, rateNum);
  }, [mrr, candidCommissionRate]);
  const [contractStartDate, setContractStartDate] = useState(contract.contractStartDate ?? '');
  const [contractEndDate, setContractEndDate] = useState(contract.contractEndDate ?? '');
  const [contractTerms, setContractTerms] = useState(contract.contractTerms ?? '');
  const [locationId, setLocationId] = useState(contract.locationId);
  const [autoRenews, setAutoRenews] = useState(contract.autoRenews);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const relatedDoc = useMemo(
    () => findDocumentForContract(contract, documents),
    [contract, documents],
  );
  const docUrl =
    relatedDoc && isCustomerDocumentAvailable(relatedDoc) ? documentViewUrl(relatedDoc) : null;
  const docLabel = relatedDoc?.filename ?? 'Contract document';

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove contract');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!agentCommId) return;
    const profile = agents.find((a) => a.id === agentCommId);
    if (profile && !agentCommissionRate) {
      setAgentCommissionRate(String(profile.commissionRate));
    }
  }, [agentCommId, agents, agentCommissionRate]);

  const handleAgentChange = (id: string) => {
    setAgentCommId(id);
    if (!id) {
      setAgentCommissionRate('');
      return;
    }
    const profile = agents.find((a) => a.id === id);
    if (profile) setAgentCommissionRate(String(profile.commissionRate));
  };

  const submit = () => {
    const rate = agentCommissionRate.trim() ? Number(agentCommissionRate) : undefined;
    if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      setError('Agent rate must be between 0 and 100.');
      return;
    }
    const mrrNum = mrr.trim() ? Number(mrr) : 0;
    if (mrr.trim() && !Number.isFinite(mrrNum)) {
      setError('MRR must be a valid number.');
      return;
    }
    const lineTotal = sumPricingLineItems(pricingLineItems);
    const mrcNum = mrc.trim() ? Number(mrc) : lineTotal || mrrNum || 0;
    if (mrc.trim() && !Number.isFinite(mrcNum)) {
      setError('MRC must be a valid number.');
      return;
    }
    const taxRateNum = taxRatePercent.trim() ? Number(taxRatePercent) : undefined;
    if (
      taxRatePercent.trim() &&
      (taxRateNum == null || !Number.isFinite(taxRateNum) || taxRateNum < 0)
    ) {
      setError('Tax % must be a valid non-negative number.');
      return;
    }
    const estimatedFromTax =
      taxRateNum != null ? estimatedTotalFromTax(mrcNum, taxRateNum) : undefined;
    const estimatedTotalBillNum = estimatedTotalBill.trim()
      ? Number(estimatedTotalBill)
      : estimatedFromTax;
    if (
      estimatedTotalBill.trim() &&
      (estimatedTotalBillNum == null || !Number.isFinite(estimatedTotalBillNum))
    ) {
      setError('Estimated total bill must be a valid number.');
      return;
    }
    const candidRateNum = candidCommissionRate.trim() ? Number(candidCommissionRate) : undefined;
    if (
      candidCommissionRate.trim() &&
      (candidRateNum == null || !Number.isFinite(candidRateNum) || candidRateNum < 0 || candidRateNum > 100)
    ) {
      setError('Candid commission rate must be between 0 and 100.');
      return;
    }
    const spiffParsed = spiffExpected.trim()
      ? evaluateSimpleMathExpression(spiffExpected)
      : null;
    if (spiffExpected.trim() && (spiffParsed == null || spiffParsed < 0)) {
      setError('SPIFF expected must be a valid amount or expression (e.g. 100x5).');
      return;
    }
    const spiffNum = spiffParsed ?? undefined;
    const commNum =
      candidRateNum != null && mrrNum > 0
        ? calcCandidCommissionAmount(mrrNum, candidRateNum)
        : contract.commissionAmount;
    const agentName = agentCommId ? resolveAgentDisplayName(agentCommId) : undefined;
    const loc = locationId || locations[0]?.id || contract.locationId;
    const servicePart = product.trim() || service.trim();
    const providerPart = provider.trim();
    const vendorParts = [providerPart, servicePart].filter(Boolean);

    const updated: CandidContractRecord = {
      ...contract,
      dealStatus,
      agentCommId: agentCommId || undefined,
      agentOfRecord: agentName,
      agentCommissionRate: agentCommId ? rate : undefined,
      paySource: paySource || undefined,
      solution: providerPart || undefined,
      dealId: dealId.trim() || undefined,
      service: service.trim() || undefined,
      product: product.trim() || undefined,
      solutionDescription: solutionDescription.trim() || undefined,
      pricingLineItems: pricingLineItems.length ? pricingLineItems : undefined,
      mrr: mrrNum || undefined,
      mrc: mrcNum || undefined,
      taxRatePercent: taxRateNum,
      estimatedTotalBill: estimatedTotalBillNum,
      monthly: mrcNum || mrrNum,
      candidCommissionRate: candidRateNum,
      commissionAmount: commNum,
      spiffExpected: spiffNum,
      contractStartDate: contractStartDate || undefined,
      contractEndDate: contractEndDate || undefined,
      contractTerms: contractTerms.trim() || undefined,
      locationId: loc,
      physicalLocationId: loc,
      billingLocationId: loc,
      vendor: vendorParts.length ? vendorParts.join(' — ') : contract.vendor,
      expires: contractEndDate || contract.expires,
      autoRenews,
    };

    setContractOverride(contract.id, {
      dealStatus: updated.dealStatus,
      agentCommId: agentCommId ? agentCommId : null,
      agentOfRecord: agentCommId ? updated.agentOfRecord ?? null : null,
      agentCommissionRate: agentCommId ? updated.agentCommissionRate ?? null : null,
      paySource: updated.paySource,
      solution: updated.solution,
      dealId: updated.dealId,
      service: updated.service,
      product: updated.product,
      solutionDescription: updated.solutionDescription,
      pricingLineItems: updated.pricingLineItems,
      mrr: updated.mrr,
      mrc: updated.mrc,
      taxRatePercent: updated.taxRatePercent,
      estimatedTotalBill: updated.estimatedTotalBill,
      monthly: updated.monthly,
      candidCommissionRate: updated.candidCommissionRate,
      commissionAmount: updated.commissionAmount,
      spiffExpected: updated.spiffExpected,
      contractStartDate: updated.contractStartDate,
      contractEndDate: updated.contractEndDate,
      contractTerms: updated.contractTerms,
      locationId: updated.locationId,
      physicalLocationId: updated.physicalLocationId,
      billingLocationId: updated.billingLocationId,
      vendor: updated.vendor,
      expires: updated.expires,
      autoRenews: updated.autoRenews,
    });

    syncContractAgentAssignment(contract, agentCommId);

    onSave(updated);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 750,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
        background: BRAND.white,
        borderRadius: 14,
        width: 1100,
        maxWidth: '96vw',
        maxHeight: 'min(92vh, 920px)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        overflow: 'hidden',
      }}
      >
        <div style={{ background: BRAND.grayDark, padding: '20px 26px', flexShrink: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: BRAND.white }}>Edit Contract</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{contractServiceTitle(contract)}</div>
            </div>
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: narrow ? '1fr' : 'minmax(320px, 1fr) minmax(340px, 1.15fr)',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
        <div
          style={{
            padding: 24,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            minHeight: 0,
            maxHeight: narrow ? '42vh' : undefined,
            borderRight: narrow ? undefined : `1px solid ${BRAND.grayBorder}`,
            borderBottom: narrow ? `1px solid ${BRAND.grayBorder}` : undefined,
          }}
        >
          {(contract.serviceBreakdown || contract.portingInfo || contract.dealNote || contract.salesOrderRef) && (
            <div style={{ marginBottom: 18, padding: 14, background: BRAND.grayLight, borderRadius: 8, border: `1px solid ${BRAND.grayBorder}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 10 }}>
                Portal import details
              </div>
              {contract.salesOrderRef ? (
                <div style={{ fontSize: 12, color: BRAND.grayDark, marginBottom: 6 }}>
                  <strong>Sales order:</strong> {contract.salesOrderRef}
                </div>
              ) : null}
              {contract.dealNote ? (
                <div style={{ fontSize: 12, color: BRAND.gray, marginBottom: 8, lineHeight: 1.5 }}>{contract.dealNote}</div>
              ) : null}
              {contract.portingInfo ? (
                <div style={{ fontSize: 12, color: BRAND.grayDark, marginBottom: 8 }}>
                  <strong>Porting:</strong>{' '}
                  {[
                    contract.portingInfo.number_ported,
                    contract.portingInfo.ported_from ? `from ${contract.portingInfo.ported_from}` : '',
                    contract.portingInfo.port_date,
                  ].filter(Boolean).join(' · ')}
                </div>
              ) : null}
              {contract.serviceBreakdown ? (
                <div style={{ fontSize: 11, color: BRAND.gray, lineHeight: 1.6 }}>
                  {formatServiceBreakdownLines(contract.serviceBreakdown).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FieldLabel>Status</FieldLabel>
              <select value={dealStatus} onChange={(e) => setDealStatus(e.target.value as DealStatus)} style={inputStyle}>
                {DEAL_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={inputStyle}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}{l.isPrimary ? ' (Primary)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Agent of record</FieldLabel>
              <select value={agentCommId} onChange={(e) => handleAgentChange(e.target.value)} style={inputStyle}>
                <option value="">Direct — Candid Solutions (no agent)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name.replace(/^\* | \*$/g, '')}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Agent commission rate (%)</FieldLabel>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={agentCommissionRate}
                onChange={(e) => setAgentCommissionRate(e.target.value)}
                placeholder="e.g. 50"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Provider</FieldLabel>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. For2Fi"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Pay source</FieldLabel>
              <select value={paySource} onChange={(e) => setPaySource(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {PAY_SOURCE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Deal ID / MID</FieldLabel>
              <input value={dealId} onChange={(e) => setDealId(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Service</FieldLabel>
              <input value={service} onChange={(e) => setService(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Product</FieldLabel>
              <input value={product} onChange={(e) => setProduct(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Description (internal / scope of services)</FieldLabel>
              <textarea
                value={solutionDescription}
                onChange={(e) => setSolutionDescription(e.target.value)}
                rows={3}
                placeholder="How the service is used — integrations, migrations, included scope."
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <PricingLineItemsEditor items={pricingLineItems} onChange={applyPricingTotals} />
            </div>
            <div>
              <FieldLabel>MRR ($)</FieldLabel>
              <input type="number" min={0} step={0.01} value={mrr} onChange={(e) => setMrr(e.target.value)} style={inputStyle} />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: BRAND.gray }}>
                Auto from checked pricing rows; editable override allowed.
              </p>
            </div>
            <div>
              <FieldLabel>MRC (monthly before tax)</FieldLabel>
              <input
                type="number"
                min={0}
                step={0.01}
                value={mrc}
                onChange={(e) => {
                  const next = e.target.value;
                  setMrc(next);
                  const mrcNumLocal = next.trim() ? Number(next) : NaN;
                  const taxRate = taxRatePercent.trim() ? Number(taxRatePercent) : NaN;
                  if (Number.isFinite(mrcNumLocal) && Number.isFinite(taxRate) && taxRate >= 0) {
                    setEstimatedTotalBill(String(estimatedTotalFromTax(mrcNumLocal, taxRate)));
                  }
                }}
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: BRAND.gray }}>
                Auto from pricing table total; editable override allowed.
              </p>
            </div>
            <div>
              <FieldLabel>Tax (%)</FieldLabel>
              <input
                type="number"
                min={0}
                step={0.01}
                value={taxRatePercent}
                onChange={(e) => {
                  const next = e.target.value;
                  setTaxRatePercent(next);
                  const taxRate = next.trim() ? Number(next) : NaN;
                  const mrcNumLocal = mrc.trim() ? Number(mrc) : NaN;
                  if (Number.isFinite(mrcNumLocal) && Number.isFinite(taxRate) && taxRate >= 0) {
                    setEstimatedTotalBill(String(estimatedTotalFromTax(mrcNumLocal, taxRate)));
                  }
                }}
                placeholder="e.g. 8.25"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Estimated total bill (with tax)</FieldLabel>
              <input
                type="number"
                min={0}
                step={0.01}
                value={estimatedTotalBill}
                onChange={(e) => setEstimatedTotalBill(e.target.value)}
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: BRAND.gray }}>
                MRC × (1 + tax%). Auto-updates when MRC or tax changes.
              </p>
            </div>
            <div>
              <FieldLabel>Candid commission rate (%)</FieldLabel>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={candidCommissionRate}
                onChange={(e) => setCandidCommissionRate(e.target.value)}
                placeholder="e.g. 12"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Commission amount ($)</FieldLabel>
              <input
                type="number"
                readOnly
                value={computedCommissionAmount != null ? String(computedCommissionAmount) : ''}
                placeholder="Auto from MRR × rate"
                style={{ ...inputStyle, background: BRAND.grayLight, color: BRAND.gray }}
              />
            </div>
            <div>
              <FieldLabel>SPIFF expected ($)</FieldLabel>
              <p style={{ margin: '0 0 5px', fontSize: 11, color: BRAND.gray, lineHeight: 1.35 }}>
                Supplier SPIFF promo x MRR
              </p>
              <input
                value={spiffExpected}
                onChange={(e) => setSpiffExpected(e.target.value)}
                onBlur={() => {
                  const result = evaluateSimpleMathExpression(spiffExpected);
                  if (result != null && String(result) !== spiffExpected.trim()) {
                    setSpiffExpected(String(result));
                  }
                }}
                placeholder="e.g. 100x5 or 500"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Contract start</FieldLabel>
              <input type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Contract end</FieldLabel>
              <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Contract terms</FieldLabel>
              <textarea value={contractTerms} onChange={(e) => setContractTerms(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={autoRenews} onChange={(e) => setAutoRenews(e.target.checked)} />
                Auto-renews
              </label>
            </div>
          </div>
          {error && <p style={{ color: '#C8281E', fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>

        <ContractPreviewPane
          url={docUrl}
          label={docLabel}
          filename={relatedDoc?.filename}
          compact={narrow}
          emptyMessage="No contract file is linked for this deal yet. Upload one under Documents to preview it here."
          onOpenFull={
            docUrl
              ? () =>
                  openDocumentViewer({
                    url: docUrl,
                    title: docLabel,
                    filename: relatedDoc?.filename,
                  })
              : undefined
          }
        />
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {confirmDelete ? (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark, marginBottom: 4 }}>
                Remove this contract?
              </div>
              <div style={{ fontSize: 12, color: BRAND.gray }}>
                {contractServiceTitle(contract)} will be removed from this customer record.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {onAddReminder && (
                <>
                  <button
                    type="button"
                    onClick={() => onAddReminder('task')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: `1px solid ${BRAND.grayBorder}`,
                      background: BRAND.white,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add task
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddReminder('reminder')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: `1px solid ${BRAND.grayBorder}`,
                      background: BRAND.white,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add reminder
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddReminder('calendar')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: `1px solid ${BRAND.grayBorder}`,
                      background: BRAND.white,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add to calendar
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  color: BRAND.red,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Remove contract
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    background: BRAND.grayLight,
                    border: `1px solid ${BRAND.grayBorder}`,
                    borderRadius: 7,
                    padding: '11px 18px',
                    fontSize: 13,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleConfirmDelete()}
                  style={{
                    background: BRAND.red,
                    color: BRAND.white,
                    border: 'none',
                    borderRadius: 7,
                    padding: '11px 22px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? 'Removing…' : 'Yes, remove'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} style={{ background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 7, padding: '11px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={submit} style={{ background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, color: BRAND.white, border: 'none', borderRadius: 7, padding: '11px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save Contract</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditContractModal;
