'use client';

import React from 'react';
import {
  emptyPricingLineItem,
  type PricingBillingFrequency,
  type PricingChargeType,
  type PricingLineItem,
  type PricingPriceStep,
} from '@/lib/customer-records';
import { formatMoney } from '@/lib/pricing-line-items';
import {
  BILLING_FREQUENCY_OPTIONS,
  contractTermMonth,
  contractTermMonths,
  isOneTimeLine,
  isScheduledLine,
  lineOneTimeTotal,
  newPriceStepId,
  normalizedPriceSteps,
  priceStepAtMonth,
  recalcPricingLine,
  splitStepsByYear,
  summarizePricingSchedule,
  withContiguousSteps,
} from '@/lib/pricing-schedule';

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
  padding: '7px 8px',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 13,
  color: BRAND.grayDark,
  outline: 'none',
  boxSizing: 'border-box',
};

const smallBtn: React.CSSProperties = {
  border: `1px solid ${BRAND.grayBorder}`,
  background: BRAND.white,
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  color: BRAND.grayDark,
  cursor: 'pointer',
};

const linkBtn: React.CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  fontSize: 11.5,
  fontWeight: 600,
  color: BRAND.red,
  cursor: 'pointer',
};

const removeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: BRAND.gray,
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
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
}

function numOrZero(v: string): number {
  return v ? Number(v) : 0;
}

function stepLabel(step: PricingPriceStep): string {
  const end = step.durationMonths ? step.startMonth + step.durationMonths - 1 : null;
  if (step.startMonth % 12 === 1 && step.durationMonths === 12) return `Year ${Math.ceil(step.startMonth / 12)}`;
  return end ? `Months ${step.startMonth}–${end}` : `Month ${step.startMonth}+`;
}

function PriceStepsEditor({
  line,
  termMonths,
  onChange,
}: {
  line: PricingLineItem;
  termMonths: number | null;
  onChange: (next: PricingLineItem) => void;
}) {
  const steps = normalizedPriceSteps(line);
  const years = termMonths ? Math.ceil(termMonths / 12) : 3;
  const col = 'minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 1fr) 28px';

  const setSteps = (next: PricingPriceStep[]) => onChange(withContiguousSteps(line, next));

  return (
    <div style={{ marginTop: 8, padding: '8px 10px', background: BRAND.grayLight, borderRadius: 6 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: col,
          gap: 8,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: BRAND.gray,
          marginBottom: 4,
        }}
      >
        <span>Price step</span>
        <span>Start month</span>
        <span>Months</span>
        <span>Unit price</span>
        <span />
      </div>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={step.id} style={{ display: 'grid', gridTemplateColumns: col, gap: 8, alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 12, color: BRAND.grayDark }}>{stepLabel(step)}</span>
            <input value={step.startMonth} readOnly style={{ ...inputStyle, background: BRAND.grayLight }} aria-label="Start month" />
            <input
              type="number"
              min={1}
              step={1}
              value={step.durationMonths ?? ''}
              placeholder={isLast ? 'Rest of term' : '12'}
              onChange={(e) =>
                setSteps(
                  steps.map((s) =>
                    s.id === step.id ? { ...s, durationMonths: e.target.value ? Number(e.target.value) : undefined } : s,
                  ),
                )
              }
              style={inputStyle}
              aria-label="Duration in months"
            />
            <input
              type="number"
              min={0}
              step={0.01}
              value={step.unitPrice || ''}
              onChange={(e) =>
                setSteps(steps.map((s) => (s.id === step.id ? { ...s, unitPrice: numOrZero(e.target.value) } : s)))
              }
              style={inputStyle}
              aria-label="Unit price"
            />
            {steps.length > 1 ? (
              <button
                type="button"
                aria-label="Remove price step"
                onClick={() => setSteps(steps.filter((s) => s.id !== step.id))}
                style={removeBtn}
              >
                ×
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={linkBtn}
          onClick={() => {
            const last = steps[steps.length - 1];
            setSteps([
              ...steps.map((s, i) => (i === steps.length - 1 && !s.durationMonths ? { ...s, durationMonths: 12 } : s)),
              { id: newPriceStepId(), startMonth: 0, unitPrice: last?.unitPrice ?? line.cost },
            ]);
          }}
        >
          + Add price step
        </button>
        {years > 1 ? (
          <button type="button" style={linkBtn} onClick={() => onChange(splitStepsByYear(line, years))}>
            Split into {years} yearly steps
          </button>
        ) : null}
        {steps.length > 1 ? (
          <button type="button" style={{ ...linkBtn, color: BRAND.gray }} onClick={() => setSteps([steps[0]])}>
            One price for whole term
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PricingLineItemsEditor({
  items,
  onChange,
  contractStartDate,
  contractEndDate,
}: {
  items: PricingLineItem[];
  onChange: (next: PricingLineItem[]) => void;
  /** Used to pick the current price step and compute per-year totals / TCV. */
  contractStartDate?: string;
  contractEndDate?: string;
}) {
  const termMonth = contractTermMonth(contractStartDate);
  const termMonths = contractTermMonths(contractStartDate, contractEndDate);
  const [openSteps, setOpenSteps] = React.useState<ReadonlySet<string>>(
    () => new Set(items.filter((l) => (l.priceSteps?.length ?? 0) > 1).map((l) => l.id)),
  );

  const replaceRow = (id: string, next: PricingLineItem) =>
    onChange(items.map((row) => (row.id === id ? next : row)));

  const updateRow = (id: string, patch: Partial<PricingLineItem>, recalc = false) =>
    onChange(
      items.map((row) => {
        if (row.id !== id) return row;
        let next = { ...row, ...patch };
        if ('cost' in patch && next.priceSteps?.length) {
          next = withContiguousSteps(
            next,
            next.priceSteps.map((s, i) => (i === 0 ? { ...s, unitPrice: next.cost } : s)),
          );
        }
        return recalc ? recalcPricingLine(next, termMonth) : next;
      }),
    );

  const summary = summarizePricingSchedule(items, { contractStartDate, contractEndDate });
  const hasSchedule = items.some(isScheduledLine);
  const col = 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 1fr) 52px 36px';

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <FieldLabel>Pricing table</FieldLabel>
        <button type="button" onClick={() => onChange([...items, emptyPricingLineItem()])} style={smallBtn}>
          + Add row
        </button>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: BRAND.gray, lineHeight: 1.4 }}>
        Unit price is per billing period. Monthly shows the normalized amount for the current price step
        {contractStartDate ? ` (month ${termMonth} of the term)` : ''}. The MRR checkbox is admin-only; one-time lines
        never count toward MRR.
      </p>
      <div style={{ border: `1px solid ${BRAND.grayBorder}`, borderRadius: 8, overflow: 'hidden', background: BRAND.white }}>
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
          <span>Unit price</span>
          <span>Qty</span>
          <span>Monthly</span>
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
          items.map((row) => {
            const oneTime = isOneTimeLine(row);
            const scheduled = isScheduledLine(row);
            const stepsOpen = openSteps.has(row.id) && !oneTime;
            const currentStep = scheduled && !oneTime ? priceStepAtMonth(row, termMonth) : null;
            return (
              <div key={row.id} style={{ padding: '8px 10px', borderTop: `1px solid ${BRAND.grayBorder}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: col, gap: 8, alignItems: 'center' }}>
                  <input
                    value={row.service}
                    onChange={(e) => updateRow(row.id, { service: e.target.value })}
                    placeholder="e.g. Dialpad Connect Pro"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={row.cost || ''}
                    onChange={(e) => updateRow(row.id, { cost: numOrZero(e.target.value) }, true)}
                    style={inputStyle}
                    aria-label={(row.priceSteps?.length ?? 0) > 1 ? 'Unit price (first step)' : 'Unit price'}
                  />
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={row.quantity || ''}
                    onChange={(e) => updateRow(row.id, { quantity: numOrZero(e.target.value) }, true)}
                    style={inputStyle}
                  />
                  {oneTime ? (
                    <span style={{ fontSize: 12, color: BRAND.gray }} title="One-time charge">
                      {formatMoney(lineOneTimeTotal(row))} once
                    </span>
                  ) : scheduled ? (
                    <span style={{ fontSize: 12.5, color: BRAND.grayDark }} title="Normalized monthly amount for the current step">
                      {formatMoney(row.monthlyTotal)}
                      <span style={{ color: BRAND.gray }}>/mo</span>
                    </span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.monthlyTotal || ''}
                      onChange={(e) => updateRow(row.id, { monthlyTotal: numOrZero(e.target.value) })}
                      style={inputStyle}
                    />
                  )}
                  <label
                    style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0, cursor: oneTime ? 'default' : 'pointer' }}
                    title={oneTime ? 'One-time lines never count toward MRR' : 'Include this line in MRR'}
                  >
                    <input
                      type="checkbox"
                      checked={!oneTime && row.includeInMrr !== false}
                      disabled={oneTime}
                      onChange={(e) => updateRow(row.id, { includeInMrr: e.target.checked })}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Remove row"
                    onClick={() => onChange(items.filter((r) => r.id !== row.id))}
                    style={removeBtn}
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <select
                    value={row.chargeType ?? 'recurring'}
                    onChange={(e) => {
                      const chargeType = e.target.value as PricingChargeType;
                      updateRow(
                        row.id,
                        chargeType === 'one_time'
                          ? { chargeType, priceSteps: undefined, billingFrequency: undefined }
                          : { chargeType, includeInMrr: true },
                        true,
                      );
                    }}
                    style={{ ...inputStyle, width: 'auto', padding: '4px 6px', fontSize: 12 }}
                    aria-label="Charge type"
                  >
                    <option value="recurring">Recurring</option>
                    <option value="one_time">One-time</option>
                  </select>
                  {!oneTime ? (
                    <select
                      value={row.billingFrequency ?? 'monthly'}
                      onChange={(e) =>
                        updateRow(row.id, { billingFrequency: e.target.value as PricingBillingFrequency }, true)
                      }
                      style={{ ...inputStyle, width: 'auto', padding: '4px 6px', fontSize: 12 }}
                      aria-label="Billing frequency"
                    >
                      {BILLING_FREQUENCY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          Billed {o.label.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {!oneTime ? (
                    <button
                      type="button"
                      style={linkBtn}
                      onClick={() =>
                        setOpenSteps((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        })
                      }
                    >
                      {stepsOpen
                        ? 'Hide price steps'
                        : (row.priceSteps?.length ?? 0) > 1
                          ? `Price steps (${row.priceSteps!.length})`
                          : '+ Price steps'}
                    </button>
                  ) : null}
                  {currentStep && (row.priceSteps?.length ?? 0) > 1 ? (
                    <span style={{ fontSize: 11, color: BRAND.gray }}>
                      Current: {stepLabel(currentStep)} at {formatMoney(currentStep.unitPrice)}
                    </span>
                  ) : null}
                </div>

                {stepsOpen ? (
                  <PriceStepsEditor
                    line={row}
                    termMonths={termMonths}
                    onChange={(next) => replaceRow(row.id, recalcPricingLine(next, termMonth))}
                  />
                ) : null}
              </div>
            );
          })
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
            <span>MRR (checked, current): {formatMoney(summary.currentMrr)}</span>
            <span>Monthly total (current): {formatMoney(summary.currentMonthly)}</span>
            {summary.oneTimeTotal > 0 ? <span>One-time: {formatMoney(summary.oneTimeTotal)}</span> : null}
          </div>
        ) : null}
        {items.length > 0 && (hasSchedule || termMonths) ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: 16,
              padding: '8px 12px 10px',
              fontSize: 12,
              color: BRAND.gray,
              background: BRAND.grayLight,
            }}
          >
            {summary.years.map((y) => (
              <span key={y.year}>
                Year {y.year}: <strong style={{ color: BRAND.grayDark }}>{formatMoney(y.total)}</strong>
              </span>
            ))}
            <span>
              TCV:{' '}
              {summary.tcv != null ? (
                <strong style={{ color: BRAND.grayDark }}>{formatMoney(summary.tcv)}</strong>
              ) : (
                <em title="Set contract start and end dates to compute total contract value">needs start/end dates</em>
              )}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
