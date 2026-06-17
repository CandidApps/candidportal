'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBmwAgentRates, resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import {
  DEAL_STATUS_OPTIONS,
  PAY_SOURCE_OPTIONS,
  type CandidContractRecord,
  type DealStatus,
} from '@/lib/customer-records';
import { setContractOverride } from '@/lib/customer-contract-overrides';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import { formatServiceBreakdownLines } from '@/lib/service-breakdown-display';
import type { Location } from '@/components/CustomersView';

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
  onClose,
  onSave,
  onDelete,
}: {
  contract: CandidContractRecord;
  locations: Location[];
  onClose: () => void;
  onSave: (updated: CandidContractRecord) => void;
  onDelete: () => void;
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
  const [mrr, setMrr] = useState(contract.mrr != null ? String(contract.mrr) : '');
  const [commissionAmount, setCommissionAmount] = useState(
    contract.commissionAmount != null ? String(contract.commissionAmount) : '',
  );
  const [contractStartDate, setContractStartDate] = useState(contract.contractStartDate ?? '');
  const [contractEndDate, setContractEndDate] = useState(contract.contractEndDate ?? '');
  const [contractTerms, setContractTerms] = useState(contract.contractTerms ?? '');
  const [locationId, setLocationId] = useState(contract.locationId);
  const [autoRenews, setAutoRenews] = useState(contract.autoRenews);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!agentCommId) return;
    const profile = agents.find((a) => a.id === agentCommId);
    if (profile && !agentCommissionRate) {
      setAgentCommissionRate(String(profile.commissionRate));
    }
  }, [agentCommId, agents, agentCommissionRate]);

  const handleAgentChange = (id: string) => {
    setAgentCommId(id);
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
    const commNum = commissionAmount.trim() ? Number(commissionAmount) : undefined;
    const agentName = agentCommId ? resolveAgentDisplayName(agentCommId) : contract.agentOfRecord;
    const loc = locationId || locations[0]?.id || contract.locationId;
    const servicePart = product.trim() || service.trim();
    const providerPart = provider.trim();
    const vendorParts = [providerPart, servicePart].filter(Boolean);

    const updated: CandidContractRecord = {
      ...contract,
      dealStatus,
      agentCommId: agentCommId || undefined,
      agentOfRecord: agentName || undefined,
      agentCommissionRate: rate,
      paySource: paySource || undefined,
      solution: providerPart || undefined,
      dealId: dealId.trim() || undefined,
      service: service.trim() || undefined,
      product: product.trim() || undefined,
      solutionDescription: solutionDescription.trim() || undefined,
      mrr: mrrNum || undefined,
      mrc: mrrNum || undefined,
      monthly: mrrNum,
      commissionAmount: commNum,
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
      agentCommId: updated.agentCommId,
      agentOfRecord: updated.agentOfRecord,
      agentCommissionRate: updated.agentCommissionRate,
      paySource: updated.paySource,
      solution: updated.solution,
      dealId: updated.dealId,
      service: updated.service,
      product: updated.product,
      solutionDescription: updated.solutionDescription,
      mrr: updated.mrr,
      mrc: updated.mrc,
      monthly: updated.monthly,
      commissionAmount: updated.commissionAmount,
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

    onSave(updated);
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 750,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
        background: BRAND.white, borderRadius: 14, width: 720, maxWidth: '95vw', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
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

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
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
                <option value="">— Select agent —</option>
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
              <FieldLabel>Service description</FieldLabel>
              <textarea
                value={solutionDescription}
                onChange={(e) => setSolutionDescription(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <FieldLabel>MRR ($)</FieldLabel>
              <input type="number" min={0} step={0.01} value={mrr} onChange={(e) => setMrr(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <FieldLabel>Commission amount ($)</FieldLabel>
              <input type="number" min={0} step={0.01} value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} style={inputStyle} />
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

          {confirmDelete ? (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: 14,
                marginTop: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark, marginBottom: 8 }}>
                Remove this contract from the customer record?
              </div>
              <div style={{ fontSize: 12, color: BRAND.gray, marginBottom: 12 }}>
                This removes <strong>{contractServiceTitle(contract)}</strong> from Active Contracts / Deals. The underlying BMW or import data is not deleted.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={onDelete}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: BRAND.red,
                    color: BRAND.white,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Yes, remove contract
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: `1px solid ${BRAND.grayBorder}`,
                    background: BRAND.white,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
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
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 7, padding: '11px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={submit} style={{ background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, color: BRAND.white, border: 'none', borderRadius: 7, padding: '11px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save Contract</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditContractModal;
