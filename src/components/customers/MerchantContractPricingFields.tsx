'use client';

import {
  PRICING_STRUCTURE_OPTIONS,
  type ContractMerchantPricing,
} from '@/lib/crm/contract-service-pricing';
import type { PricingStructureId } from '@/lib/analysis/types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #E2E2E2',
  borderRadius: 6,
  padding: '10px 12px',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 13,
  color: '#1E1E1E',
  outline: 'none',
  boxSizing: 'border-box',
};

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label
    style={{
      display: 'block',
      fontSize: 11,
      fontWeight: 600,
      color: '#6B6B6B',
      letterSpacing: '0.06em',
      marginBottom: 5,
    }}
  >
    {children}
  </label>
);

export type MerchantPricingFormState = {
  monthlyVolume: string;
  avgTicket: string;
  pricingStructureId: PricingStructureId | '';
  markupBps: string;
  ratePercent: string;
  dualCustomerFeePct: string;
  monthlyFees: string;
};

export function emptyMerchantPricingForm(): MerchantPricingFormState {
  return {
    monthlyVolume: '',
    avgTicket: '',
    pricingStructureId: '',
    markupBps: '',
    ratePercent: '',
    dualCustomerFeePct: '',
    monthlyFees: '',
  };
}

export function merchantPricingFromContract(
  pricing?: ContractMerchantPricing | null,
  pricingStructureId?: PricingStructureId | null,
): MerchantPricingFormState {
  return {
    monthlyVolume: pricing?.monthlyVolume != null ? String(pricing.monthlyVolume) : '',
    avgTicket: pricing?.avgTicket != null ? String(pricing.avgTicket) : '',
    pricingStructureId: pricing?.pricingStructureId ?? pricingStructureId ?? '',
    markupBps: pricing?.markupBps != null ? String(pricing.markupBps) : '',
    ratePercent: pricing?.ratePercent != null ? String(pricing.ratePercent) : '',
    dualCustomerFeePct:
      pricing?.dualCustomerFeePct != null ? String(pricing.dualCustomerFeePct) : '',
    monthlyFees: pricing?.monthlyFees != null ? String(pricing.monthlyFees) : '',
  };
}

export function buildMerchantPricingFromForm(
  form: MerchantPricingFormState,
): ContractMerchantPricing | undefined {
  const monthlyVolume = form.monthlyVolume.trim() ? Number(form.monthlyVolume) : undefined;
  const avgTicket = form.avgTicket.trim() ? Number(form.avgTicket) : undefined;
  const markupBps = form.markupBps.trim() ? Number(form.markupBps) : undefined;
  const ratePercent = form.ratePercent.trim() ? Number(form.ratePercent) : undefined;
  const dualCustomerFeePct = form.dualCustomerFeePct.trim()
    ? Number(form.dualCustomerFeePct)
    : undefined;
  const monthlyFees = form.monthlyFees.trim() ? Number(form.monthlyFees) : undefined;
  const pricingStructureId = form.pricingStructureId || undefined;

  if (
    !pricingStructureId &&
    monthlyVolume == null &&
    markupBps == null &&
    ratePercent == null &&
    dualCustomerFeePct == null &&
    monthlyFees == null
  ) {
    return undefined;
  }

  return {
    monthlyVolume,
    avgTicket,
    pricingStructureId,
    markupBps,
    ratePercent,
    dualCustomerFeePct,
    monthlyFees,
  };
}

export function MerchantContractPricingFields({
  value,
  onChange,
}: {
  value: MerchantPricingFormState;
  onChange: (next: MerchantPricingFormState) => void;
}) {
  const set = <K extends keyof MerchantPricingFormState>(key: K, next: MerchantPricingFormState[K]) =>
    onChange({ ...value, [key]: next });

  const structure = value.pricingStructureId;

  return (
    <div
      style={{
        gridColumn: '1 / -1',
        border: '1px solid #E2E2E2',
        borderRadius: 8,
        padding: 14,
        background: '#FAFAFA',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#6B6B6B',
          marginBottom: 12,
        }}
      >
        Merchant processing pricing
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <FieldLabel>Monthly card volume ($)</FieldLabel>
          <input
            type="number"
            min={0}
            step={1}
            value={value.monthlyVolume}
            onChange={(e) => set('monthlyVolume', e.target.value)}
            placeholder="e.g. 85000"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Average ticket ($)</FieldLabel>
          <input
            type="number"
            min={0}
            step={0.01}
            value={value.avgTicket}
            onChange={(e) => set('avgTicket', e.target.value)}
            placeholder="e.g. 125"
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>Pricing structure</FieldLabel>
          <select
            value={value.pricingStructureId}
            onChange={(e) => set('pricingStructureId', e.target.value as PricingStructureId | '')}
            style={inputStyle}
          >
            <option value="">Select…</option>
            {PRICING_STRUCTURE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Monthly fixed fees ($)</FieldLabel>
          <input
            type="number"
            min={0}
            step={0.01}
            value={value.monthlyFees}
            onChange={(e) => set('monthlyFees', e.target.value)}
            placeholder="PCI, statement, etc."
            style={inputStyle}
          />
        </div>
        {structure === 'interchange_plus' ? (
          <div>
            <FieldLabel>Markup (basis points)</FieldLabel>
            <input
              type="number"
              min={0}
              step={1}
              value={value.markupBps}
              onChange={(e) => set('markupBps', e.target.value)}
              placeholder="e.g. 25"
              style={inputStyle}
            />
          </div>
        ) : null}
        {structure === 'flat_rate' || structure === 'flat3' ? (
          <div>
            <FieldLabel>Rate (% of volume)</FieldLabel>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={value.ratePercent}
              onChange={(e) => set('ratePercent', e.target.value)}
              placeholder={structure === 'flat3' ? '3' : 'e.g. 2.75'}
              style={inputStyle}
            />
          </div>
        ) : null}
        {structure === 'dual_pricing' ? (
          <div>
            <FieldLabel>Customer fee (%)</FieldLabel>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={value.dualCustomerFeePct}
              onChange={(e) => set('dualCustomerFeePct', e.target.value)}
              placeholder="e.g. 3.5"
              style={inputStyle}
            />
          </div>
        ) : null}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11, color: '#6B6B6B', lineHeight: 1.5 }}>
        Merchant deals bill as a percent of card volume. Estimated monthly cost is calculated from volume
        and the selected structure — shown on the customer&apos;s My Services page.
      </p>
    </div>
  );
}
