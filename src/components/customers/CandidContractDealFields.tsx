'use client';

import React, { useMemo } from 'react';
import {
  DEAL_STATUS_OPTIONS,
  PAY_SOURCE_OPTIONS,
  calcCandidCommissionAmount,
  emptyPricingLineItem,
  pricingLineMonthlyTotal,
  type CandidContractRecord,
  type DealStatus,
  type PricingLineItem,
} from '@/lib/customer-records';
import type { ContractDocumentExtractResult } from '@/lib/contract-document-extract';
import type { Location } from '@/components/CustomersView';
import {
  estimatedTotalFromTax,
  evaluateSimpleMathExpression,
  formatMoney,
  sumPricingLineItems,
  sumPricingLineItemsForMrr,
} from '@/lib/pricing-line-items';

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
  pricingLineItems: PricingLineItem[];
  candidCommissionRate: string;
  spiffExpected: string;
  mrr: string;
  mrc: string;
  taxRatePercent: string;
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
    pricingLineItems: [],
    candidCommissionRate: '',
    spiffExpected: '',
    mrr: '',
    mrc: '',
    taxRatePercent: '',
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

  const nextLines =
    !current.pricingLineItems.length && result.pricingLineItems?.length
      ? result.pricingLineItems
      : current.pricingLineItems;

  const mrcFromLines = sumPricingLineItems(nextLines);
  const mrrFromLines = sumPricingLineItemsForMrr(nextLines);
  const nextMrc = current.mrc.trim()
    ? current.mrc
    : result.mrc != null
      ? String(result.mrc)
      : mrcFromLines > 0
        ? String(mrcFromLines)
        : current.mrc;
  const nextMrr = current.mrr.trim()
    ? current.mrr
    : result.mrr != null
      ? String(result.mrr)
      : mrrFromLines > 0
        ? String(mrrFromLines)
        : current.mrr;
  const mrcNum = nextMrc.trim() ? Number(nextMrc) : 0;
  const taxRate = current.taxRatePercent.trim() ? Number(current.taxRatePercent) : undefined;

  return {
    ...current,
    dealId: setIfEmpty(current.dealId, result.dealId),
    paySource: setIfEmpty(current.paySource, result.paySource),
    solution: setIfEmpty(current.solution, result.provider),
    product: setIfEmpty(current.product, result.product),
    service: setIfEmpty(current.service, result.service),
    solutionDescription: setIfEmpty(current.solutionDescription, result.serviceDescription),
    pricingLineItems: nextLines,
    mrr: nextMrr,
    mrc: nextMrc,
    estimatedTotalBill: setNumIfEmpty(
      current.estimatedTotalBill,
      result.estimatedTotalBill ??
        (taxRate != null && mrcNum > 0 ? estimatedTotalFromTax(mrcNum, taxRate) : undefined),
    ),
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
  const mrcNum = form.mrc.trim()
    ? Number(form.mrc)
    : sumPricingLineItems(form.pricingLineItems) || undefined;
  const taxRateNum = form.taxRatePercent.trim() ? Number(form.taxRatePercent) : undefined;
  const candidRateNum = form.candidCommissionRate.trim()
    ? Number(form.candidCommissionRate)
    : undefined;
  const spiffParsed = evaluateSimpleMathExpression(form.spiffExpected);
  const spiffNum = spiffParsed != null ? spiffParsed : undefined;
  const pricingLineItems = form.pricingLineItems
    .map((row) => ({
      ...row,
      service: row.service.trim(),
      monthlyTotal:
        row.monthlyTotal || pricingLineMonthlyTotal(row.cost, row.quantity),
      includeInMrr: row.includeInMrr !== false,
    }))
    .filter((row) => row.service || row.cost || row.monthlyTotal);
  const estimatedFromTax =
    mrcNum != null && taxRateNum != null && Number.isFinite(taxRateNum)
      ? estimatedTotalFromTax(mrcNum, taxRateNum)
      : undefined;
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
    pricingLineItems: pricingLineItems.length ? pricingLineItems : undefined,
    candidCommissionRate: candidRateNum,
    commissionAmount:
      candidRateNum != null && mrrNum > 0
        ? calcCandidCommissionAmount(mrrNum, candidRateNum)
        : undefined,
    spiffExpected: spiffNum,
    mrr: mrrNum || undefined,
    mrc: mrcNum,
    taxRatePercent: taxRateNum,
    estimatedTotalBill: form.estimatedTotalBill.trim()
      ? Number(form.estimatedTotalBill)
      : estimatedFromTax,
    dealStatus: form.dealStatus,
    contractTerms: form.contractTerms.trim() || undefined,
    contractStartDate: form.contractStartDate || undefined,
    contractEndDate: form.contractEndDate || undefined,
    physicalLocationId: form.physicalLocationId || loc,
    billingLocationId: form.billingLocationId || loc,
    vendor:
      [form.solution, form.service, form.product].filter(Boolean).join(' · ') || 'Candid Contract',
    monthly: mrcNum ?? mrrNum,
    expires: form.contractEndDate || '—',
    autoRenews: false,
  };
}

export function PricingLineItemsEditor({
  items,
  onChange,
}: {
  items: PricingLineItem[];
  onChange: (next: PricingLineItem[]) => void;
}) {
  const updateRow = (id: string, patch: Partial<PricingLineItem>, recalcTotal = false) => {
    onChange(
      items.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (recalcTotal) {
          next.monthlyTotal = pricingLineMonthlyTotal(next.cost, next.quantity);
        }
        return next;
      }),
    );
  };

  const total = sumPricingLineItems(items);
  const mrrTotal = sumPricingLineItemsForMrr(items);
  const col = 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 1fr) 52px 36px';

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <FieldLabel>Pricing table</FieldLabel>
        <button
          type="button"
          onClick={() => onChange([...items, emptyPricingLineItem()])}
          style={{
            border: `1px solid ${BRAND.grayBorder}`,
            background: BRAND.white,
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 600,
            color: BRAND.grayDark,
            cursor: 'pointer',
          }}
        >
          + Add row
        </button>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: BRAND.gray, lineHeight: 1.4 }}>
        Customer sees Service / Cost / Qty / Monthly. The MRR checkbox is admin-only and rolls
        checked lines into MRR.
      </p>
      <div
        style={{
          border: `1px solid ${BRAND.grayBorder}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: BRAND.white,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: col,
            gap: 8,
            padding: '8px 10px',
            background: BRAND.grayLight,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: BRAND.gray,
            alignItems: 'center',
          }}
        >
          <span>Service</span>
          <span>Cost</span>
          <span>Qty</span>
          <span>Monthly total</span>
          <span title="Include in MRR" style={{ textAlign: 'center' }}>
            MRR
          </span>
          <span />
        </div>
        {items.length === 0 ? (
          <div style={{ padding: '14px 12px', fontSize: 12, color: BRAND.gray }}>
            No line items yet. Parse a contract or add a row.
          </div>
        ) : (
          items.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: col,
                gap: 8,
                padding: '8px 10px',
                borderTop: `1px solid ${BRAND.grayBorder}`,
                alignItems: 'center',
              }}
            >
              <input
                value={row.service}
                onChange={(e) => updateRow(row.id, { service: e.target.value })}
                placeholder="e.g. Dialpad Connect Pro"
                style={{ ...inputStyle, padding: '7px 8px' }}
              />
              <input
                type="number"
                min={0}
                step={0.01}
                value={row.cost || ''}
                onChange={(e) =>
                  updateRow(row.id, { cost: e.target.value ? Number(e.target.value) : 0 }, true)
                }
                style={{ ...inputStyle, padding: '7px 8px' }}
              />
              <input
                type="number"
                min={0}
                step={1}
                value={row.quantity || ''}
                onChange={(e) =>
                  updateRow(
                    row.id,
                    { quantity: e.target.value ? Number(e.target.value) : 0 },
                    true,
                  )
                }
                style={{ ...inputStyle, padding: '7px 8px' }}
              />
              <input
                type="number"
                min={0}
                step={0.01}
                value={row.monthlyTotal || ''}
                onChange={(e) =>
                  updateRow(row.id, {
                    monthlyTotal: e.target.value ? Number(e.target.value) : 0,
                  })
                }
                style={{ ...inputStyle, padding: '7px 8px' }}
              />
              <label
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  margin: 0,
                  cursor: 'pointer',
                }}
                title="Include this line in MRR"
              >
                <input
                  type="checkbox"
                  checked={row.includeInMrr !== false}
                  onChange={(e) => updateRow(row.id, { includeInMrr: e.target.checked })}
                />
              </label>
              <button
                type="button"
                aria-label="Remove row"
                onClick={() => onChange(items.filter((r) => r.id !== row.id))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: BRAND.gray,
                  cursor: 'pointer',
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
        {items.length > 0 ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: 16,
              padding: '10px 12px',
              borderTop: `1px solid ${BRAND.grayBorder}`,
              fontSize: 12,
              fontWeight: 600,
              color: BRAND.grayDark,
              background: BRAND.grayLight,
            }}
          >
            <span>MRR (checked): {formatMoney(mrrTotal)}</span>
            <span>MRC table total: {formatMoney(total)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Sync MRC / MRR / estimated bill from pricing table + tax rate. Fields stay editable after. */
export function withPricingDrivenTotals(
  current: CandidContractFormState,
  pricingLineItems: PricingLineItem[],
): CandidContractFormState {
  const mrcTotal = sumPricingLineItems(pricingLineItems);
  const mrrTotal = sumPricingLineItemsForMrr(pricingLineItems);
  const taxRate = current.taxRatePercent.trim() ? Number(current.taxRatePercent) : NaN;
  const mrcNum = mrcTotal;
  const estimated =
    Number.isFinite(taxRate) && taxRate >= 0
      ? estimatedTotalFromTax(mrcNum, taxRate)
      : current.estimatedTotalBill;
  return {
    ...current,
    pricingLineItems,
    mrc: pricingLineItems.length ? String(mrcTotal) : current.mrc,
    mrr: pricingLineItems.length ? String(mrrTotal) : current.mrr,
    estimatedTotalBill:
      pricingLineItems.length && Number.isFinite(taxRate) && taxRate >= 0
        ? String(estimated)
        : current.estimatedTotalBill,
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
            placeholder="e.g. Dialpad"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Service</FieldLabel>
          <input
            value={value.service}
            onChange={(e) => set('service', e.target.value)}
            placeholder="e.g. UCaaS"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Product</FieldLabel>
          <input
            value={value.product}
            onChange={(e) => set('product', e.target.value)}
            placeholder="e.g. Dialpad Connect Pro"
            style={inputStyle}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel>Description (internal / scope of services)</FieldLabel>
          <textarea
            value={value.solutionDescription}
            onChange={(e) => set('solutionDescription', e.target.value)}
            rows={3}
            placeholder="How the service is used — integrations, migrations, included scope. Not for seat/pricing dumps."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <PricingLineItemsEditor
          items={value.pricingLineItems}
          onChange={(pricingLineItems) =>
            onChange(withPricingDrivenTotals(value, pricingLineItems))
          }
        />

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
          <p style={{ margin: '4px 0 0', fontSize: 11, color: BRAND.gray }}>
            Auto from checked pricing rows; editable override allowed.
          </p>
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
          <p style={{ margin: '0 0 5px', fontSize: 11, color: BRAND.gray, lineHeight: 1.35 }}>
            Supplier SPIFF promo x MRR
          </p>
          <input
            value={value.spiffExpected}
            onChange={(e) => set('spiffExpected', e.target.value)}
            onBlur={() => {
              const result = evaluateSimpleMathExpression(value.spiffExpected);
              if (result != null && String(result) !== value.spiffExpected.trim()) {
                set('spiffExpected', String(result));
              }
            }}
            placeholder="e.g. 100x5 or 500"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>MRC (monthly before tax)</FieldLabel>
          <input
            value={value.mrc}
            onChange={(e) => {
              const mrc = e.target.value;
              const taxRate = value.taxRatePercent.trim() ? Number(value.taxRatePercent) : NaN;
              const mrcNum = mrc.trim() ? Number(mrc) : NaN;
              onChange({
                ...value,
                mrc,
                estimatedTotalBill:
                  Number.isFinite(mrcNum) && Number.isFinite(taxRate) && taxRate >= 0
                    ? String(estimatedTotalFromTax(mrcNum, taxRate))
                    : value.estimatedTotalBill,
              });
            }}
            type="number"
            min={0}
            step={0.01}
            style={inputStyle}
          />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: BRAND.gray }}>
            Auto from pricing table total; editable override allowed.
          </p>
        </div>
        <div>
          <FieldLabel>Tax (%)</FieldLabel>
          <input
            value={value.taxRatePercent}
            onChange={(e) => {
              const taxRatePercent = e.target.value;
              const taxRate = taxRatePercent.trim() ? Number(taxRatePercent) : NaN;
              const mrcNum = value.mrc.trim() ? Number(value.mrc) : NaN;
              onChange({
                ...value,
                taxRatePercent,
                estimatedTotalBill:
                  Number.isFinite(mrcNum) && Number.isFinite(taxRate) && taxRate >= 0
                    ? String(estimatedTotalFromTax(mrcNum, taxRate))
                    : value.estimatedTotalBill,
              });
            }}
            type="number"
            min={0}
            step={0.01}
            placeholder="e.g. 8.25"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Estimated total bill (with tax)</FieldLabel>
          <input
            value={value.estimatedTotalBill}
            onChange={(e) => set('estimatedTotalBill', e.target.value)}
            type="number"
            min={0}
            step={0.01}
            style={inputStyle}
          />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: BRAND.gray }}>
            MRC × (1 + tax%). Auto-updates when MRC or tax changes; editable override allowed.
          </p>
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
