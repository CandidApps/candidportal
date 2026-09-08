'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { QUOTE_SERVICE_TYPES } from '@/lib/quote-flow-config';
import {
  contractServiceTypeLabel,
  estimateMerchantMonthlyCost,
  inferServiceTypeIdFromText,
  isMerchantServiceType,
  type PipelineContractExtras,
} from '@/lib/crm/contract-service-pricing';
import {
  MerchantContractPricingFields,
  buildMerchantPricingFromForm,
  emptyMerchantPricingForm,
  merchantPricingFromContract,
  type MerchantPricingFormState,
} from '@/components/customers/MerchantContractPricingFields';
import {
  DEAL_BASE_SERVICES,
  isPaymentSolutionsBase,
  joinServiceDetails,
  normalizeServiceDetails,
  serviceDetailsForBase,
} from '@/lib/crm/deal-service-taxonomy';
import { getBmwAgentRates, resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import { upsertBmwAgentRate } from '@/lib/bmw/upsert-agent-rate';

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
  agentCommId: string;
  agentOfRecord: string;
  agentCommissionRate: string;
  paySource: string;
  serviceTypeId: string;
  baseService: string;
  serviceDetail: string;
  serviceDetails: string[];
  solution: string;
  service: string;
  product: string;
  solutionDescription: string;
  merchantPricing: MerchantPricingFormState;
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
    agentCommId: '',
    agentOfRecord: '',
    agentCommissionRate: '',
    paySource: '',
    serviceTypeId: '',
    baseService: '',
    serviceDetail: '',
    serviceDetails: [],
    solution: '',
    service: '',
    product: '',
    solutionDescription: '',
    merchantPricing: emptyMerchantPricingForm(),
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

export function candidContractFormFromRecord(
  contract: CandidContractRecord,
): CandidContractFormState {
  const serviceDetails = normalizeServiceDetails(contract.serviceDetails, contract.serviceDetail);
  return {
    dealId: contract.dealId ?? '',
    agentCommId: contract.agentCommId ?? '',
    agentOfRecord: contract.agentOfRecord ?? '',
    agentCommissionRate:
      contract.agentCommissionRate != null ? String(contract.agentCommissionRate) : '',
    paySource: contract.paySource ?? '',
    serviceTypeId:
      contract.serviceTypeId ??
      inferServiceTypeIdFromText(contract.service, contract.product, contract.solution) ??
      '',
    baseService: contract.baseService ?? '',
    serviceDetail: joinServiceDetails(serviceDetails) || contract.serviceDetail || '',
    serviceDetails,
    solution: contract.solution ?? '',
    service: contract.service ?? '',
    product: contract.product ?? '',
    solutionDescription: contract.solutionDescription ?? '',
    merchantPricing: merchantPricingFromContract(contract.merchantPricing, contract.pricingStructureId),
    pricingLineItems: contract.pricingLineItems ?? [],
    candidCommissionRate:
      contract.candidCommissionRate != null ? String(contract.candidCommissionRate) : '',
    spiffExpected: contract.spiffExpected != null ? String(contract.spiffExpected) : '',
    mrr: contract.mrr != null ? String(contract.mrr) : '',
    mrc: contract.mrc != null ? String(contract.mrc) : contract.monthly != null ? String(contract.monthly) : '',
    taxRatePercent: contract.taxRatePercent != null ? String(contract.taxRatePercent) : '',
    estimatedTotalBill:
      contract.estimatedTotalBill != null ? String(contract.estimatedTotalBill) : '',
    dealStatus: contract.dealStatus,
    contractTerms: contract.contractTerms ?? '',
    contractStartDate: contract.contractStartDate ?? '',
    contractEndDate: contract.contractEndDate ?? '',
    physicalLocationId: contract.physicalLocationId ?? contract.locationId ?? '',
    billingLocationId: contract.billingLocationId ?? contract.locationId ?? '',
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

/**
 * Apply quote / bill-analysis extras onto a contract form.
 * Quote/analysis wins for service type + merchant pricing when present.
 */
export function applyPipelineExtrasToForm(
  current: CandidContractFormState,
  extras: PipelineContractExtras | null | undefined,
  opts?: {
    paySource?: string | null;
    solution?: string | null;
    serviceLabel?: string | null;
    preferExtras?: boolean;
  },
): CandidContractFormState {
  if (!extras && !opts?.paySource && !opts?.solution && !opts?.serviceLabel) return current;
  const prefer = opts?.preferExtras !== false;
  const setIfEmpty = (cur: string, value: string | null | undefined) =>
    value?.trim() && !cur.trim() ? value.trim() : cur;
  const setPrefer = (cur: string, value: string | null | undefined) => {
    if (!value?.trim()) return cur;
    return prefer || !cur.trim() ? value.trim() : cur;
  };

  const serviceTypeId = setPrefer(current.serviceTypeId, extras?.serviceTypeId ?? '');
  const next: CandidContractFormState = {
    ...current,
    serviceTypeId,
    paySource: setIfEmpty(current.paySource, opts?.paySource),
    solution: setIfEmpty(current.solution, opts?.solution),
    service: setPrefer(
      current.service,
      opts?.serviceLabel ||
        (serviceTypeId ? contractServiceTypeLabel(serviceTypeId) : '') ||
        '',
    ),
  };

  if (extras?.merchantPricing) {
    next.merchantPricing =
      prefer || !current.merchantPricing.monthlyVolume.trim()
        ? merchantPricingFromContract(extras.merchantPricing, extras.pricingStructureId)
        : current.merchantPricing;
    const estimated =
      extras.estimatedMonthly ?? estimateMerchantMonthlyCost(extras.merchantPricing);
    if (estimated != null && (prefer || !current.mrc.trim())) {
      next.mrc = String(estimated);
      next.mrr = String(estimated);
      if (!current.estimatedTotalBill.trim() || prefer) {
        next.estimatedTotalBill = String(estimated);
      }
    }
  } else if (extras?.estimatedMonthly != null && (prefer || !current.mrc.trim())) {
    next.mrc = String(extras.estimatedMonthly);
    if (!current.mrr.trim()) next.mrr = String(extras.estimatedMonthly);
  }

  return next;
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
  const merchantPricing = buildMerchantPricingFromForm(form.merchantPricing);
  const merchantMonthly = isMerchantServiceType(form.serviceTypeId)
    ? estimateMerchantMonthlyCost(merchantPricing)
    : undefined;
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
  const serviceLabel =
    form.service.trim() ||
    contractServiceTypeLabel(form.serviceTypeId) ||
    undefined;
  const resolvedMrc = merchantMonthly ?? mrcNum;
  const resolvedMrr = merchantMonthly ?? (mrrNum || undefined);
  const serviceDetails = normalizeServiceDetails(form.serviceDetails, form.serviceDetail);
  const agentCommId = form.agentCommId.trim();
  const agentRateNum = form.agentCommissionRate.trim()
    ? Number(form.agentCommissionRate)
    : undefined;
  const agentOfRecord =
    (agentCommId ? resolveAgentDisplayName(agentCommId) : '') ||
    form.agentOfRecord.trim() ||
    undefined;

  return {
    id: opts.id,
    customerId: opts.customerId,
    locationId: loc,
    dealId: form.dealId.trim() || undefined,
    agentCommId: agentCommId || undefined,
    agentOfRecord,
    agentCommissionRate:
      agentCommId && agentRateNum != null && Number.isFinite(agentRateNum)
        ? agentRateNum
        : undefined,
    paySource: form.paySource || undefined,
    serviceTypeId: form.serviceTypeId || undefined,
    baseService: form.baseService.trim() || undefined,
    serviceDetail: joinServiceDetails(serviceDetails) || undefined,
    serviceDetails: serviceDetails.length ? serviceDetails : undefined,
    solution: form.solution.trim() || undefined,
    service: serviceLabel,
    product: form.product.trim() || undefined,
    solutionDescription: form.solutionDescription.trim() || undefined,
    merchantPricing: merchantPricing,
    pricingStructureId: merchantPricing?.pricingStructureId ?? undefined,
    pricingLineItems: pricingLineItems.length ? pricingLineItems : undefined,
    candidCommissionRate: candidRateNum,
    commissionAmount:
      candidRateNum != null && mrrNum > 0
        ? calcCandidCommissionAmount(mrrNum, candidRateNum)
        : undefined,
    spiffExpected: spiffNum,
    mrr: resolvedMrr,
    mrc: resolvedMrc,
    taxRatePercent: taxRateNum,
    estimatedTotalBill: form.estimatedTotalBill.trim()
      ? Number(form.estimatedTotalBill)
      : merchantMonthly ?? estimatedFromTax,
    dealStatus: form.dealStatus,
    contractTerms: form.contractTerms.trim() || undefined,
    contractStartDate: form.contractStartDate || undefined,
    contractEndDate: form.contractEndDate || undefined,
    physicalLocationId: form.physicalLocationId || loc,
    billingLocationId: form.billingLocationId || loc,
    vendor:
      [form.solution, serviceLabel, form.product].filter(Boolean).join(' · ') || 'Candid Contract',
    monthly: resolvedMrc ?? resolvedMrr ?? 0,
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
  onCreateLocation,
  title = 'Candid contract details',
}: {
  value: CandidContractFormState;
  onChange: (next: CandidContractFormState) => void;
  locations: Location[];
  /** Persist a new location and return it (or throw). Used for inline add. */
  onCreateLocation?: (location: Omit<Location, 'id'> & { id?: string }) => Promise<Location> | Location;
  title?: string;
}) {
  const set = <K extends keyof CandidContractFormState>(key: K, next: CandidContractFormState[K]) =>
    onChange({ ...value, [key]: next });

  const [agentTick, setAgentTick] = useState(0);
  const agents = useMemo(
    () =>
      getBmwAgentRates()
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh after inline create
    [agentTick],
  );

  const paymentMulti = isPaymentSolutionsBase(value.baseService);
  const detailOptions = value.baseService.trim()
    ? serviceDetailsForBase(value.baseService)
    : [];

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

  const handleAgentChange = (id: string) => {
    if (!id) {
      onChange({
        ...value,
        agentCommId: '',
        agentOfRecord: '',
        agentCommissionRate: '',
      });
      return;
    }
    const profile = agents.find((a) => a.id === id);
    onChange({
      ...value,
      agentCommId: id,
      agentOfRecord: profile?.name.replace(/^\* | \*$/g, '') ?? resolveAgentDisplayName(id),
      agentCommissionRate: profile ? String(profile.commissionRate) : value.agentCommissionRate,
    });
  };

  const setServiceDetails = (details: string[]) => {
    const normalized = normalizeServiceDetails(details);
    onChange({
      ...value,
      serviceDetails: normalized,
      serviceDetail: joinServiceDetails(normalized),
    });
  };

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
          <FieldLabel>Commission agent (who gets paid)</FieldLabel>
          <select
            value={value.agentCommId}
            onChange={(e) => handleAgentChange(e.target.value)}
            style={inputStyle}
          >
            <option value="">Direct — Candid Solutions (no agent)</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name.replace(/^\* | \*$/g, '')}
              </option>
            ))}
          </select>
          <InlineAddAgent
            onCreated={(agent) => {
              setAgentTick((n) => n + 1);
              onChange({
                ...value,
                agentCommId: agent.id,
                agentOfRecord: agent.name,
                agentCommissionRate: String(agent.commissionRate),
              });
            }}
          />
        </div>
        <div>
          <FieldLabel>Agent commission rate (%)</FieldLabel>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={value.agentCommissionRate}
            onChange={(e) => set('agentCommissionRate', e.target.value)}
            placeholder="e.g. 50"
            disabled={!value.agentCommId}
            style={{
              ...inputStyle,
              background: value.agentCommId ? BRAND.white : BRAND.grayLight,
            }}
          />
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
          <FieldLabel>Service type</FieldLabel>
          <select
            value={value.serviceTypeId}
            onChange={(e) => {
              const serviceTypeId = e.target.value;
              const label = contractServiceTypeLabel(serviceTypeId);
              onChange({
                ...value,
                serviceTypeId,
                service: value.service.trim() || label,
              });
            }}
            style={inputStyle}
          >
            <option value="">Select…</option>
            {QUOTE_SERVICE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Base service</FieldLabel>
          <select
            value={value.baseService}
            onChange={(e) => {
              const baseService = e.target.value;
              const allowed = serviceDetailsForBase(baseService);
              const kept = normalizeServiceDetails(value.serviceDetails, value.serviceDetail).filter(
                (d) => allowed.includes(d),
              );
              const nextDetails = isPaymentSolutionsBase(baseService)
                ? kept
                : kept.slice(0, 1);
              onChange({
                ...value,
                baseService,
                serviceDetails: nextDetails,
                serviceDetail: joinServiceDetails(nextDetails),
              });
            }}
            style={inputStyle}
          >
            <option value="">Select…</option>
            {DEAL_BASE_SERVICES.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div style={paymentMulti ? { gridColumn: '1 / -1' } : undefined}>
          <FieldLabel>
            Service detail{paymentMulti ? ' (multi-select)' : ''}
          </FieldLabel>
          {paymentMulti ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: 10,
                border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 6,
                background: BRAND.white,
              }}
            >
              {detailOptions.map((label) => {
                const on = value.serviceDetails.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on
                        ? value.serviceDetails.filter((d) => d !== label)
                        : [...value.serviceDetails, label];
                      setServiceDetails(next);
                    }}
                    style={{
                      font: 'inherit',
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '6px 12px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      border: `1px solid ${on ? BRAND.red : BRAND.grayBorder}`,
                      background: on ? 'rgba(200,40,30,0.08)' : BRAND.white,
                      color: BRAND.grayDark,
                    }}
                  >
                    {on ? '✓ ' : ''}
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <select
              value={value.serviceDetail}
              onChange={(e) => {
                const serviceDetail = e.target.value;
                onChange({
                  ...value,
                  serviceDetail,
                  serviceDetails: serviceDetail ? [serviceDetail] : [],
                });
              }}
              style={inputStyle}
              disabled={!value.baseService.trim()}
            >
              <option value="">Select…</option>
              {detailOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
              {value.serviceDetail && !detailOptions.includes(value.serviceDetail) ? (
                <option value={value.serviceDetail}>{value.serviceDetail}</option>
              ) : null}
            </select>
          )}
        </div>
        <div>
          <FieldLabel>Solution / Provider</FieldLabel>
          <input
            value={value.solution}
            onChange={(e) => set('solution', e.target.value)}
            placeholder="e.g. PaymentCloud"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Service label</FieldLabel>
          <input
            value={value.service}
            onChange={(e) => set('service', e.target.value)}
            placeholder={value.serviceTypeId ? contractServiceTypeLabel(value.serviceTypeId) : 'e.g. UCaaS'}
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

        {isMerchantServiceType(value.serviceTypeId) ? (
          <MerchantContractPricingFields
            value={value.merchantPricing}
            onChange={(merchantPricing) => {
              const estimated = estimateMerchantMonthlyCost(buildMerchantPricingFromForm(merchantPricing));
              onChange({
                ...value,
                merchantPricing,
                mrc: estimated != null ? String(estimated) : value.mrc,
                estimatedTotalBill:
                  estimated != null ? String(estimated) : value.estimatedTotalBill,
              });
            }}
          />
        ) : (
          <PricingLineItemsEditor
            items={value.pricingLineItems}
            onChange={(pricingLineItems) =>
              onChange(withPricingDrivenTotals(value, pricingLineItems))
            }
          />
        )}

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
          <SearchableLocationSelect
            locations={locations}
            value={value.physicalLocationId}
            onChange={(id) => set('physicalLocationId', id)}
            onCreateLocation={onCreateLocation}
          />
        </div>
        <div>
          <FieldLabel>Billing Location</FieldLabel>
          <SearchableLocationSelect
            locations={locations}
            value={value.billingLocationId}
            onChange={(id) => set('billingLocationId', id)}
            onCreateLocation={onCreateLocation}
          />
        </div>
      </div>
    </>
  );
}

function locationOptionLabel(l: Location): string {
  const addr = [l.city, l.state].filter(Boolean).join(', ');
  return `${l.label}${l.isPrimary ? ' (Primary)' : ''}${addr ? ` — ${addr}` : ''}`;
}

function SearchableLocationSelect({
  locations,
  value,
  onChange,
  onCreateLocation,
}: {
  locations: Location[];
  value: string;
  onChange: (id: string) => void;
  onCreateLocation?: (location: Omit<Location, 'id'> & { id?: string }) => Promise<Location> | Location;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    label: '',
    street: '',
    city: '',
    state: '',
    zip: '',
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = locations.find((l) => l.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((l) =>
      [l.label, l.street, l.city, l.state, l.zip].join(' ').toLowerCase().includes(q),
    );
  }, [locations, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const createLocation = async () => {
    if (!onCreateLocation) return;
    if (!draft.street.trim() || !draft.city.trim()) {
      window.alert('Street and city are required.');
      return;
    }
    setSaving(true);
    try {
      const created = await onCreateLocation({
        label: draft.label.trim() || 'Location',
        street: draft.street.trim(),
        city: draft.city.trim(),
        state: draft.state.trim(),
        zip: draft.zip.trim(),
        isPrimary: locations.length === 0,
      });
      onChange(created.id);
      setAdding(false);
      setOpen(false);
      setQuery('');
      setDraft({ label: '', street: '', city: '', state: '', zip: '' });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not add location');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery('');
        }}
        style={{
          ...inputStyle,
          textAlign: 'left',
          cursor: 'pointer',
          background: BRAND.white,
        }}
      >
        {selected ? locationOptionLabel(selected) : locations.length ? 'Select location…' : 'No locations yet — add one'}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            background: BRAND.white,
            border: `1px solid ${BRAND.grayBorder}`,
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            maxHeight: 280,
            overflow: 'auto',
          }}
        >
          <div style={{ padding: 8, borderBottom: `1px solid ${BRAND.grayBorder}` }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search locations…"
              style={{ ...inputStyle, padding: '8px 10px' }}
            />
          </div>
          {filtered.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                onChange(l.id);
                setOpen(false);
                setQuery('');
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                border: 'none',
                background: l.id === value ? 'rgba(200,40,30,0.06)' : 'transparent',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: 13,
                color: BRAND.grayDark,
              }}
            >
              {locationOptionLabel(l)}
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: BRAND.gray }}>No matches</div>
          )}
          {onCreateLocation && (
            <div style={{ borderTop: `1px solid ${BRAND.grayBorder}`, padding: 8 }}>
              {!adding ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: `1px dashed ${BRAND.grayBorder}`,
                    borderRadius: 6,
                    background: BRAND.grayLight,
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: 12,
                    fontWeight: 600,
                    color: BRAND.grayDark,
                  }}
                >
                  + Add new location
                </button>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <input
                    placeholder="Label"
                    value={draft.label}
                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                  <input
                    placeholder="Street *"
                    value={draft.street}
                    onChange={(e) => setDraft((d) => ({ ...d, street: e.target.value }))}
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px', gap: 6 }}>
                    <input
                      placeholder="City *"
                      value={draft.city}
                      onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
                      style={{ ...inputStyle, padding: '8px 10px' }}
                    />
                    <input
                      placeholder="ST"
                      value={draft.state}
                      maxLength={2}
                      onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
                      style={{ ...inputStyle, padding: '8px 10px' }}
                    />
                    <input
                      placeholder="ZIP"
                      value={draft.zip}
                      onChange={(e) => setDraft((d) => ({ ...d, zip: e.target.value }))}
                      style={{ ...inputStyle, padding: '8px 10px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void createLocation()}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        border: 'none',
                        borderRadius: 6,
                        background: BRAND.red,
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {saving ? 'Saving…' : 'Save location'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdding(false)}
                      style={{
                        padding: '8px 10px',
                        border: `1px solid ${BRAND.grayBorder}`,
                        borderRadius: 6,
                        background: BRAND.white,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InlineAddAgent({
  onCreated,
}: {
  onCreated: (agent: { id: string; name: string; commissionRate: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('50');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 6,
          background: 'none',
          border: 'none',
          padding: 0,
          fontSize: 11,
          fontWeight: 600,
          color: BRAND.red,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        + Add agent not in list
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        border: `1px solid ${BRAND.grayBorder}`,
        borderRadius: 8,
        background: BRAND.grayLight,
        display: 'grid',
        gap: 8,
      }}
    >
      <input
        placeholder="Agent name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ ...inputStyle, padding: '8px 10px' }}
      />
      <input
        type="number"
        min={0}
        max={100}
        step={0.5}
        placeholder="Commission rate % *"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        style={{ ...inputStyle, padding: '8px 10px' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const commissionRate = Number(rate);
            if (!name.trim()) {
              window.alert('Agent name is required.');
              return;
            }
            if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
              window.alert('Rate must be between 0 and 100.');
              return;
            }
            setBusy(true);
            void upsertBmwAgentRate({ name: name.trim(), commissionRate })
              .then((agent) => {
                onCreated(agent);
                setOpen(false);
                setName('');
                setRate('50');
              })
              .catch((err) => {
                window.alert(err instanceof Error ? err.message : 'Could not add agent');
              })
              .finally(() => setBusy(false));
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: 'none',
            borderRadius: 6,
            background: BRAND.red,
            color: '#fff',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Save agent'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            padding: '8px 10px',
            border: `1px solid ${BRAND.grayBorder}`,
            borderRadius: 6,
            background: BRAND.white,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
