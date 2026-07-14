'use client';

import React, { useMemo } from 'react';
import {
  DEAL_STATUS_OPTIONS,
  PAY_SOURCE_OPTIONS,
  calcCandidCommissionAmount,
  type CandidContractRecord,
  type DealStatus,
} from '@/lib/customer-records';
import type { ContractDocumentExtractResult } from '@/lib/contract-document-extract';
import type { Location } from '@/components/CustomersView';

const BRAND = {
  red: '#C8281E',
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
  <label
    style={{
      display: 'block',
      fontSize: 11,
      fontWeight: 600,
      color: BRAND.gray,
      letterSpacing: '0.06em',
      marginBottom: 5,
    }}
  >
    {children}
  </label>
);

export type CandidContractFormState = {
  dealId: string;
  agentOfRecord: string;
  paySource: string;
  solution: string;
  service: string;
  product: string;
  solutionDescription: string;
  candidCommissionRate: string;
  spiffExpected: string;
  mrr: string;
  mrc: string;
  estimatedTotalBill: string;
  dealStatus: DealStatus;
  contractTerms: string;
  contractStartDate: string;
  contractEndDate: string;
  physicalLocationId: string;
  billingLocationId: string;
};

export function emptyCandidContractForm(defaultLocationId = ''): CandidContractFormState {
  return {
    dealId: '',
    agentOfRecord: '',
    paySource: '',
    solution: '',
    service: '',
    product: '',
    solutionDescription: '',
    candidCommissionRate: '',
    spiffExpected: '',
    mrr: '',
    mrc: '',
    estimatedTotalBill: '',
    dealStatus: 'active',
    contractTerms: '',
    contractStartDate: '',
    contractEndDate: '',
    physicalLocationId: defaultLocationId,
    billingLocationId: defaultLocationId,
  };
}

/** Prefill empty form fields from a prior contract/website extract — no new AI call. */
export function applyContractExtractToForm(
  current: CandidContractFormState,
  result: ContractDocumentExtractResult | null | undefined,
): CandidContractFormState {
  if (!result) return current;
  const setIfEmpty = (cur: string, value: string | undefined) =>
    value?.trim() && !cur.trim() ? value.trim() : cur;
  const setNumIfEmpty = (cur: string, value: number | undefined) =>
    value != null && Number.isFinite(value) && !cur.trim() ? String(value) : cur;

  return {
    ...current,
    dealId: setIfEmpty(current.dealId, result.dealId),
    paySource: setIfEmpty(current.paySource, result.paySource),
    solution: setIfEmpty(current.solution, result.provider),
    product: setIfEmpty(current.product, result.product),
    solutionDescription: setIfEmpty(current.solutionDescription, result.serviceDescription),
    service: setIfEmpty(current.service, result.serviceDescription),
    mrr: setNumIfEmpty(current.mrr, result.mrr),
    mrc: setNumIfEmpty(current.mrc, result.mrc ?? result.mrr),
    contractStartDate: setIfEmpty(current.contractStartDate, result.contractStartDate),
    contractEndDate: setIfEmpty(current.contractEndDate, result.contractEndDate),
    contractTerms: setIfEmpty(current.contractTerms, result.renewalTerms),
  };
}

export function buildCandidContractRecord(
  form: CandidContractFormState,
  opts: { id: string; customerId: string; locationId: string },
): CandidContractRecord {
  const loc = opts.locationId || form.physicalLocationId || form.billingLocationId;
  const mrrNum = form.mrr.trim() ? Number(form.mrr) : 0;
  const candidRateNum = form.candidCommissionRate.trim()
    ? Number(form.candidCommissionRate)
    : undefined;
  const spiffNum = form.spiffExpected.trim() ? Number(form.spiffExpected) : undefined;
  return {
    id: opts.id,
    customerId: opts.customerId,
    locationId: loc,
    dealId: form.dealId.trim() || undefined,
    agentOfRecord: form.agentOfRecord.trim() || undefined,
    paySource: form.paySource || undefined,
    solution: form.solution.trim() || undefined,
    service: form.service.trim() || undefined,
    product: form.product.trim() || undefined,
    solutionDescription: form.solutionDescription.trim() || undefined,
    candidCommissionRate: candidRateNum,
    commissionAmount:
      candidRateNum != null && mrrNum > 0
        ? calcCandidCommissionAmount(mrrNum, candidRateNum)
        : undefined,
    spiffExpected: spiffNum,
    mrr: mrrNum || undefined,
    mrc: form.mrc.trim() ? Number(form.mrc) : undefined,
    estimatedTotalBill: form.estimatedTotalBill.trim()
      ? Number(form.estimatedTotalBill)
      : undefined,
    dealStatus: form.dealStatus,
    contractTerms: form.contractTerms.trim() || undefined,
    contractStartDate: form.contractStartDate || undefined,
    contractEndDate: form.contractEndDate || undefined,
    physicalLocationId: form.physicalLocationId || loc,
    billingLocationId: form.billingLocationId || loc,
    vendor:
      [form.solution, form.service, form.product].filter(Boolean).join(' · ') || 'Candid Contract',
    monthly: mrrNum,
    expires: form.contractEndDate || '—',
    autoRenews: false,
  };
}

export function CandidContractDealFields({
  value,
  onChange,
  locations,
  title = 'Candid contract details',
}: {
  value: CandidContractFormState;
  onChange: (next: CandidContractFormState) => void;
  locations: Location[];
  title?: string;
}) {
  const set = <K extends keyof CandidContractFormState>(key: K, next: CandidContractFormState[K]) =>
    onChange({ ...value, [key]: next });

  const computedCommissionAmount = useMemo(() => {
    const mrrNum = value.mrr.trim() ? Number(value.mrr) : undefined;
    const rateNum = value.candidCommissionRate.trim()
      ? Number(value.candidCommissionRate)
      : undefined;
    if (mrrNum == null || rateNum == null || !Number.isFinite(mrrNum) || !Number.isFinite(rateNum)) {
      return undefined;
    }
    return calcCandidCommissionAmount(mrrNum, rateNum);
  }, [value.mrr, value.candidCommissionRate]);

  return (
    <>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: BRAND.gray,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <FieldLabel>Deal ID</FieldLabel>
          <input value={value.dealId} onChange={(e) => set('dealId', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <FieldLabel>Agent of Record</FieldLabel>
          <input
            value={value.agentOfRecord}
            onChange={(e) => set('agentOfRecord', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Pay Source</FieldLabel>
          <select
            value={value.paySource}
            onChange={(e) => set('paySource', e.target.value)}
            style={inputStyle}
          >
            <option value="">Select…</option>
            {PAY_SOURCE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Deal Status</FieldLabel>
          <select
            value={value.dealStatus}
            onChange={(e) => set('dealStatus', e.target.value as DealStatus)}
            style={inputStyle}
          >
            {DEAL_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Solution</FieldLabel>
          <input
            value={value.solution}
            onChange={(e) => set('solution', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Service</FieldLabel>
          <input value={value.service} onChange={(e) => set('service', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <FieldLabel>Product</FieldLabel>
          <input value={value.product} onChange={(e) => set('product', e.target.value)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel>Solution Description</FieldLabel>
          <textarea
            value={value.solutionDescription}
            onChange={(e) => set('solutionDescription', e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        <div>
          <FieldLabel>MRR ($)</FieldLabel>
          <input
            value={value.mrr}
            onChange={(e) => set('mrr', e.target.value)}
            type="number"
            min={0}
            step={0.01}
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Candid commission rate (%)</FieldLabel>
          <input
            value={value.candidCommissionRate}
            onChange={(e) => set('candidCommissionRate', e.target.value)}
            type="number"
            min={0}
            max={100}
            step={0.01}
            placeholder="e.g. 12"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Commission amount ($)</FieldLabel>
          <input
            readOnly
            value={computedCommissionAmount != null ? String(computedCommissionAmount) : ''}
            placeholder="Auto from MRR × rate"
            type="number"
            style={{ ...inputStyle, background: BRAND.grayLight, color: BRAND.gray }}
          />
        </div>
        <div>
          <FieldLabel>SPIFF expected ($)</FieldLabel>
          <input
            value={value.spiffExpected}
            onChange={(e) => set('spiffExpected', e.target.value)}
            type="number"
            min={0}
            step={0.01}
            placeholder="One-time SPIFF"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>MRC</FieldLabel>
          <input
            value={value.mrc}
            onChange={(e) => set('mrc', e.target.value)}
            type="number"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Estimated Total Bill</FieldLabel>
          <input
            value={value.estimatedTotalBill}
            onChange={(e) => set('estimatedTotalBill', e.target.value)}
            type="number"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Contract Start</FieldLabel>
          <input
            value={value.contractStartDate}
            onChange={(e) => set('contractStartDate', e.target.value)}
            type="date"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Contract End</FieldLabel>
          <input
            value={value.contractEndDate}
            onChange={(e) => set('contractEndDate', e.target.value)}
            type="date"
            style={inputStyle}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel>Contract Terms</FieldLabel>
          <textarea
            value={value.contractTerms}
            onChange={(e) => set('contractTerms', e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        <div>
          <FieldLabel>Physical Location</FieldLabel>
          <select
            value={value.physicalLocationId}
            onChange={(e) => set('physicalLocationId', e.target.value)}
            style={inputStyle}
          >
            {locations.length === 0 ? (
              <option value="">Primary (from account)</option>
            ) : (
              locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                  {l.isPrimary ? ' (Primary)' : ''}
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <FieldLabel>Billing Location</FieldLabel>
          <select
            value={value.billingLocationId}
            onChange={(e) => set('billingLocationId', e.target.value)}
            style={inputStyle}
          >
            {locations.length === 0 ? (
              <option value="">Primary (from account)</option>
            ) : (
              locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                  {l.isPrimary ? ' (Primary)' : ''}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
    </>
  );
}
