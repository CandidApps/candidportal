'use client';

import { useState, type ReactNode } from 'react';
import type { PricingStructureId, PricingStructureOption } from '@/lib/analysis/types';
import {
  DEFAULT_DUAL_CUSTOMER_FEE_PCT,
  togglePricingStructureSelection,
} from '@/lib/analysis/pricing-structure-options';
import {
  calcDualPricingFromCustomerFee,
  fmt$,
  merchantProcessingRateFromCustomerFee,
} from '@/lib/candid-pay/pricingEngine';

function CollapsibleRateDetails({
  preview,
  children,
  expandLabel = 'View rate details',
}: {
  preview: ReactNode;
  children: ReactNode;
  expandLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pricing-structure-preview-wrap">
      <div className="pricing-structure-preview">{preview}</div>
      <button
        type="button"
        className="pricing-structure-expand-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide details' : expandLabel}
        <span className={`pricing-structure-expand-chevron${open ? ' is-open' : ''}`} aria-hidden>
          ▾
        </span>
      </button>
      {open ? <div className="pricing-structure-details">{children}</div> : null}
    </div>
  );
}

function InterchangePlusPreview({ opt }: { opt: PricingStructureOption }) {
  const current = opt.currentMarkupBps ?? 0;
  const cardMarkups = opt.proposedCardMarkups ?? [];
  const perItemFees = opt.proposedPerItemFees ?? [];
  const blended = opt.proposedMarkupBps;

  return (
    <ul className="pricing-structure-preview-list">
      <li>
        <span className="pricing-structure-preview-key">Current</span>
        <span>{current > 0 ? `Interchange + ${current} bps` : '—'}</span>
      </li>
      <li>
        <span className="pricing-structure-preview-key">Proposed</span>
        <span>
          {cardMarkups.length > 0 ? (
            cardMarkups.map((m, i) => (
              <span key={`${m.label}-${m.markupBps}`}>
                {i > 0 ? ' · ' : null}
                <strong>{m.label}</strong> IC+{m.markupBps} bps
              </span>
            ))
          ) : blended != null ? (
            `Interchange + ${blended} bps`
          ) : (
            <span style={{ color: 'var(--gray)' }}>Not on schedule</span>
          )}
        </span>
      </li>
      {perItemFees.length > 0 ? (
        <li>
          <span className="pricing-structure-preview-key">Per txn</span>
          <span>
            {perItemFees.map((fee, i) => (
              <span key={`${fee.label}-${fee.perItem}`}>
                {i > 0 ? ' · ' : null}
                {fmt$(fee.perItem)}
                {fee.monthlyEstimate != null && fee.monthlyEstimate > 0
                  ? ` (~${fmt$(fee.monthlyEstimate)}/mo)`
                  : null}
              </span>
            ))}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

function InterchangePlusBreakdown({ opt }: { opt: PricingStructureOption }) {
  const current = opt.currentMarkupBps ?? 0;
  const cardMarkups = opt.proposedCardMarkups ?? [];
  const perItemFees = opt.proposedPerItemFees ?? [];
  const hasMultipleMarkups = cardMarkups.length > 1;
  const blended = opt.proposedMarkupBps;

  return (
    <>
      <table className="dual-pricing-breakdown-table">
        <tbody>
          <tr>
            <td>Current markup (parsed from statement)</td>
            <td className="dual-pricing-breakdown-amt">
              {current > 0 ? `Interchange + ${current} bps` : '—'}
            </td>
          </tr>
          {cardMarkups.length > 0 ? (
            cardMarkups.map((markup) => (
              <tr key={`${markup.label}-${markup.rateLabel}`} className="dual-pricing-breakdown-total">
                <td>Proposed — {markup.label}</td>
                <td className="dual-pricing-breakdown-amt">
                  Interchange + <strong>{markup.markupBps} bps</strong>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)', fontWeight: 500 }}>
                    {markup.rateLabel}
                  </span>
                </td>
              </tr>
            ))
          ) : (
            <tr className="dual-pricing-breakdown-total">
              <td>Proposed sell rate (Our rate schedule)</td>
              <td className="dual-pricing-breakdown-amt">
                {blended != null ? (
                  <>
                    Interchange + <strong>{blended} bps</strong>
                  </>
                ) : (
                  <span style={{ color: 'var(--gray)' }}>Not on schedule</span>
                )}
              </td>
            </tr>
          )}
          {perItemFees.map((fee) => (
            <tr key={`${fee.label}-${fee.perItem}`}>
              <td>Proposed — {fee.label}</td>
              <td className="dual-pricing-breakdown-amt">
                <strong>{fmt$(fee.perItem)}</strong> per transaction
                {fee.monthlyEstimate != null && fee.monthlyEstimate > 0 ? (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)', fontWeight: 500 }}>
                    ~{fmt$(fee.monthlyEstimate)}/mo at current volume
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMultipleMarkups && blended != null && (
        <p className="interchange-plus-source">
          Blended markup: <strong>Interchange + {blended} bps</strong> (volume-weighted by card brand)
        </p>
      )}
      {opt.proposedMarkupSource && cardMarkups.length === 0 && (
        <p className="interchange-plus-source">
          Schedule line: <strong>{opt.proposedMarkupSource}</strong>
        </p>
      )}
      <p className="interchange-plus-source-note">
        Savings compare your markup, per-item fees, and all-in rate vs our sell schedule (interchange
        pass-through held constant).
      </p>
    </>
  );
}

function DualPricingPreview({
  customerFeePct,
  merchantProcPct,
}: {
  customerFeePct: number;
  merchantProcPct: string;
}) {
  return (
    <ul className="pricing-structure-preview-list">
      <li>
        <span className="pricing-structure-preview-key">Customer fee</span>
        <span>
          <strong>{customerFeePct}%</strong>
        </span>
      </li>
      <li>
        <span className="pricing-structure-preview-key">Merchant rate</span>
        <span>
          <strong>{merchantProcPct}%</strong> processing (net $0 on cards)
        </span>
      </li>
    </ul>
  );
}

function DualPricingBreakdown({ customerFeePct }: { customerFeePct: number }) {
  const feePct = customerFeePct > 0 ? customerFeePct : DEFAULT_DUAL_CUSTOMER_FEE_PCT;
  const sample = calcDualPricingFromCustomerFee({ customerFeePct: feePct, ccVolume: 100 });
  const procPct = sample.merchantProcessingPct.toFixed(3);

  return (
    <div className="dual-pricing-breakdown">
      <div className="dual-pricing-breakdown-title">How are fees calculated?</div>
      <p className="dual-pricing-breakdown-note">
        To ensure a net $0 fee to the merchant, merchant processing should be set up at{' '}
        <strong>{procPct}%</strong>.
      </p>
      <table className="dual-pricing-breakdown-table">
        <tbody>
          <tr>
            <td>Invoice total</td>
            <td className="dual-pricing-breakdown-amt">$100.00</td>
          </tr>
          <tr>
            <td>Fee to customer ({feePct}%)</td>
            <td className="dual-pricing-breakdown-amt">{fmt$(sample.feeToCustomer)}</td>
          </tr>
          <tr>
            <td>Total charged to customer</td>
            <td className="dual-pricing-breakdown-amt">{fmt$(sample.totalChargedToCustomer)}</td>
          </tr>
          <tr>
            <td>
              Merchant processing fee ({fmt$(sample.totalChargedToCustomer)} × {procPct}%)
            </td>
            <td className="dual-pricing-breakdown-amt dual-pricing-breakdown-amt--neg">
              −{fmt$(sample.merchantProcessingFee)}
            </td>
          </tr>
          <tr className="dual-pricing-breakdown-total">
            <td>Deposited to merchant</td>
            <td className="dual-pricing-breakdown-amt">{fmt$(sample.depositedToMerchant)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function PricingStructuresPanel({
  options,
  dualPricingCustomerFeePct,
  onChange,
  onDualPricingCustomerFeePctChange,
}: {
  options: PricingStructureOption[];
  dualPricingCustomerFeePct: number;
  onChange: (next: PricingStructureOption[]) => void;
  onDualPricingCustomerFeePctChange: (pct: number) => void;
}) {
  const selected = options.filter((o) => o.selected);
  const addable = options.filter((o) => !o.selected);
  const dualSelected = selected.some((o) => o.id === 'dual_pricing');
  const merchantProcPct = merchantProcessingRateFromCustomerFee(
    dualPricingCustomerFeePct > 0 ? dualPricingCustomerFeePct : DEFAULT_DUAL_CUSTOMER_FEE_PCT,
  ).toFixed(3);

  const toggle = (id: PricingStructureId, on: boolean) => {
    onChange(togglePricingStructureSelection(options, id, on));
  };

  const onFeeInput = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onDualPricingCustomerFeePctChange(parsed);
  };

  return (
    <div className="pricing-structures-panel">
      <div className="pricing-structures-panel-head">
        <div>
          <div className="pricing-structures-eyebrow">Pricing structures for customer proposal</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
            Default matches the customer&apos;s current pricing model. Add alternatives below — options with negative
            savings or commission cannot be selected.
          </div>
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="pricing-structures-selected-grid">
          {selected.map((opt) => (
            <div
              key={opt.id}
              className={`pricing-structure-card${opt.isCurrentStructure ? ' pricing-structure-card--current' : ''}`}
            >
              <div className="pricing-structure-card-top">
                <div>
                  <div className="pricing-structure-card-title">{opt.label}</div>
                  {opt.isCurrentStructure && (
                    <span className="pricing-structure-badge">Current structure</span>
                  )}
                </div>
                {!opt.isCurrentStructure && (
                  <button
                    type="button"
                    className="pricing-structure-remove"
                    onClick={() => toggle(opt.id, false)}
                    title="Remove from proposal"
                  >
                    ×
                  </button>
                )}
              </div>

              {opt.id === 'interchange_plus' && (
                <CollapsibleRateDetails
                  preview={<InterchangePlusPreview opt={opt} />}
                  expandLabel="View interchange breakdown"
                >
                  <div className="interchange-plus-breakdown interchange-plus-breakdown--expanded">
                    <InterchangePlusBreakdown opt={opt} />
                  </div>
                </CollapsibleRateDetails>
              )}

              {opt.id === 'dual_pricing' && (
                <CollapsibleRateDetails
                  preview={
                    <DualPricingPreview
                      customerFeePct={
                        dualPricingCustomerFeePct > 0
                          ? dualPricingCustomerFeePct
                          : DEFAULT_DUAL_CUSTOMER_FEE_PCT
                      }
                      merchantProcPct={merchantProcPct}
                    />
                  }
                  expandLabel="Edit fee & view calculation"
                >
                  <div className="dual-pricing-fee-row">
                    <label className="dual-pricing-fee-label">
                      Fee to merchant&apos;s customer (%)
                      <input
                        type="number"
                        className="dual-pricing-fee-input"
                        min={0}
                        step={0.1}
                        value={dualPricingCustomerFeePct}
                        onChange={(e) => onFeeInput(e.target.value)}
                      />
                    </label>
                    <div className="dual-pricing-merchant-rate">
                      Merchant processing rate: <strong>{merchantProcPct}%</strong> (auto-calculated for net $0 on
                      cards)
                    </div>
                    <DualPricingBreakdown customerFeePct={dualPricingCustomerFeePct} />
                  </div>
                </CollapsibleRateDetails>
              )}

              {opt.id !== 'interchange_plus' && opt.id !== 'dual_pricing' && (
                <div className="pricing-structure-rate">{opt.proposedRateLabel}</div>
              )}
              <div className="pricing-structure-metrics">
                <div>
                  <div className="pricing-structure-metric-label">Est. savings</div>
                  <div className="pricing-structure-metric-value positive">
                    {fmt$(opt.monthlySavings)}/mo
                  </div>
                  <div className="pricing-structure-metric-sub">{fmt$(opt.annualSavings)}/yr</div>
                </div>
                <div>
                  <div className="pricing-structure-metric-label">Est. commission</div>
                  <div className="pricing-structure-metric-value">
                    {fmt$(opt.estimatedCommission)}/mo
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--gray)', margin: '12px 0 0' }}>
          No selectable pricing structures for this account. Adjust rates or review the parsed statement.
        </p>
      )}

      {addable.length > 0 && (
        <div className="pricing-structures-add-row">
          <div className="pricing-structures-add-label">Add pricing structure</div>
          <div className="pricing-structures-chips">
            {addable.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`pricing-structure-chip${opt.selectable ? '' : ' pricing-structure-chip--disabled'}`}
                disabled={!opt.selectable}
                title={opt.exclusionReason ?? opt.description}
                onClick={() => opt.selectable && toggle(opt.id, true)}
              >
                + {opt.label}
                {!opt.selectable && opt.exclusionReason ? ` (${opt.exclusionReason})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {!dualSelected && addable.some((o) => o.id === 'dual_pricing' && o.selectable) && (
        <p className="dual-pricing-hint">
          Add Dual Pricing / Cash Discount to set the customer-facing fee and auto-calculate merchant processing.
        </p>
      )}
    </div>
  );
}
