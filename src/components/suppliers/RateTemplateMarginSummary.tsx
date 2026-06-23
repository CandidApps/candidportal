'use client';

import { useMemo, useState } from 'react';
import {
  calcRateTemplateMarginSummary,
  DEFAULT_MARGIN_ASSUMPTIONS,
  MARGIN_PRODUCT_LABELS,
  matchRateLinePairs,
  type MarginProductKey,
  type RateTemplateMarginAssumptions,
} from '@/lib/analysis/rate-template-margin';
import { fmt$ } from '@/lib/candid-pay/pricingEngine';
import type { MerchantRiskTier } from '@/lib/analysis/merchant-risk';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';

type Props = {
  ourRateLines: ScheduleARateLine[];
  scheduleALines: ScheduleARateLine[];
};

const PRODUCT_ORDER: MarginProductKey[] = ['cc', 'ach', 'rdc', 'pin_debit'];

function parseNum(raw: string): number {
  return Math.max(0, parseFloat(raw.replace(/,/g, '')) || 0);
}

function parseTxn(raw: string): number {
  return Math.max(0, parseInt(raw.replace(/,/g, ''), 10) || 0);
}

const RISK_TIER_OPTIONS: { value: MerchantRiskTier; label: string }[] = [
  { value: 'low', label: 'Low risk' },
  { value: 'mid', label: 'Medium risk' },
  { value: 'high', label: 'High risk' },
];

export function RateTemplateMarginSummary({ ourRateLines, scheduleALines }: Props) {
  const [assumptions, setAssumptions] = useState<RateTemplateMarginAssumptions>(DEFAULT_MARGIN_ASSUMPTIONS);
  const [showLineDetail, setShowLineDetail] = useState(false);

  const summary = useMemo(
    () => calcRateTemplateMarginSummary(ourRateLines, scheduleALines, assumptions),
    [ourRateLines, scheduleALines, assumptions],
  );

  const linePairs = useMemo(
    () => matchRateLinePairs(ourRateLines, scheduleALines),
    [ourRateLines, scheduleALines],
  );

  const setProduct = (key: MarginProductKey, patch: Partial<RateTemplateMarginAssumptions['products'][MarginProductKey]>) => {
    setAssumptions((prev) => ({
      ...prev,
      products: {
        ...prev.products,
        [key]: { ...prev.products[key], ...patch },
      },
    }));
  };

  if (!summary.hasOurRate) {
    return (
      <p className="rate-margin-summary-empty">
        Add sell-rate lines to this template to see margin vs Schedule A.
      </p>
    );
  }

  if (!summary.hasScheduleA) {
    return (
      <p className="rate-margin-summary-empty">
        Upload a Schedule A on the partner&apos;s Schedule A tab to compare buy costs vs this template.
      </p>
    );
  }

  return (
    <div className="rate-margin-summary">
      <div className="rate-margin-summary-header">
        <div>
          <div className="rate-margin-summary-title">Our Rate vs Schedule A — margin summary</div>
          <div className="rate-margin-summary-subtitle">
            Choose which fee categories apply, set volume and transaction assumptions per product, and pick the
            merchant risk tier. Fees tagged for medium/high risk on Schedule A only count when that tier is selected.
          </div>
        </div>
      </div>

      <div className="rate-margin-product-panel">
        <div className="rate-margin-product-panel-title">Include in estimate</div>
        <label className="rate-margin-risk-tier">
          <span>Merchant risk tier</span>
          <select
            value={assumptions.riskTier}
            onChange={(e) =>
              setAssumptions((prev) => ({ ...prev, riskTier: e.target.value as MerchantRiskTier }))
            }
          >
            {RISK_TIER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="rate-margin-product-grid">
          {PRODUCT_ORDER.map((key) => {
            const product = assumptions.products[key];
            const enabled = product.enabled;
            return (
              <div key={key} className={`rate-margin-product-card${enabled ? '' : ' rate-margin-product-card--off'}`}>
                <label className="rate-margin-product-check">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setProduct(key, { enabled: e.target.checked })}
                  />
                  <span>{MARGIN_PRODUCT_LABELS[key]}</span>
                </label>
                <label>
                  <span>Volume / mo</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={!enabled}
                    value={String(product.monthlyVolume || '')}
                    onChange={(e) => setProduct(key, { monthlyVolume: parseNum(e.target.value) })}
                  />
                </label>
                <label>
                  <span>Transactions / mo</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={!enabled}
                    value={String(product.monthlyTransactions || '')}
                    onChange={(e) => setProduct(key, { monthlyTransactions: parseTxn(e.target.value) })}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      {summary.categories.length === 0 ? (
        <p className="rate-margin-summary-empty">
          No fee categories selected or no comparable rates on both schedules. Enable at least one product above
          and ensure matching lines exist on Our Rate and Schedule A.
        </p>
      ) : (
        <table className="admin-mini-table rate-margin-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Our rate (sell)</th>
              <th>Schedule A (buy)</th>
              <th>Margin</th>
              <th>Est. monthly revenue</th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((row) => (
              <tr key={`${row.product ?? row.id}-${row.label}`}>
                <td className="rate-margin-category">{row.label}</td>
                <td>{row.sellSummary}</td>
                <td>{row.buySummary}</td>
                <td className={row.marginMonthly >= 0 ? 'rate-margin-positive' : 'rate-margin-negative'}>
                  {row.marginSummary}
                </td>
                <td className={row.marginMonthly >= 0 ? 'rate-margin-positive' : 'rate-margin-negative'}>
                  {row.marginMonthly >= 0 ? '+' : '−'} {fmt$(Math.abs(row.marginMonthly))}
                </td>
              </tr>
            ))}
            <tr className="rate-margin-total-row">
              <td colSpan={4}>
                <strong>Gross program margin</strong>
                <span className="rate-margin-total-hint"> (before revenue share)</span>
              </td>
              <td className={summary.grossMarginMonthly >= 0 ? 'rate-margin-positive' : 'rate-margin-negative'}>
                <strong>
                  {summary.grossMarginMonthly >= 0 ? '+' : '−'} {fmt$(Math.abs(summary.grossMarginMonthly))}
                </strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {summary.riskRows.length > 0 && (
        <div className="rate-margin-profitability">
          <div className="rate-margin-profitability-title">Expected profitability by risk tier</div>
          <p className="rate-margin-profitability-hint">
            Applies Schedule A reseller revenue share to the gross margin above (selected products only). Mid/high
            risk includes applicable risk fee spreads when card processing is enabled.
          </p>
          <table className="admin-mini-table rate-margin-table">
            <thead>
              <tr>
                <th>Risk tier</th>
                <th>Revenue share</th>
                <th>Gross margin</th>
                <th>Est. net / mo</th>
                <th>Est. net / yr</th>
              </tr>
            </thead>
            <tbody>
              {summary.riskRows.map((row) => (
                <tr key={row.tier}>
                  <td>{row.label}</td>
                  <td>{row.revenueSharePct}%</td>
                  <td>{fmt$(row.grossMarginMonthly)}</td>
                  <td className={row.estimatedNetMonthly >= 0 ? 'rate-margin-positive' : 'rate-margin-negative'}>
                    {row.estimatedNetMonthly >= 0 ? '+' : '−'} {fmt$(Math.abs(row.estimatedNetMonthly))}
                  </td>
                  <td className={row.estimatedNetAnnual >= 0 ? 'rate-margin-positive' : 'rate-margin-negative'}>
                    {row.estimatedNetAnnual >= 0 ? '+' : '−'} {fmt$(Math.abs(row.estimatedNetAnnual))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {linePairs.length > 0 && (
        <div className="rate-margin-line-detail">
          <button
            type="button"
            className="rate-margin-line-detail-toggle"
            onClick={() => setShowLineDetail((v) => !v)}
          >
            {showLineDetail ? 'Hide' : 'Show'} matched line-by-line comparison ({linePairs.length})
          </button>
          {showLineDetail && (
            <table className="admin-mini-table rate-margin-table rate-margin-line-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Section</th>
                  <th>Item</th>
                  <th>Our rate</th>
                  <th>Schedule A</th>
                  <th>Margin</th>
                </tr>
              </thead>
              <tbody>
                {linePairs.map((pair) => (
                  <tr key={`${pair.section}-${pair.item}`}>
                    <td>{MARGIN_PRODUCT_LABELS[pair.product]}</td>
                    <td>{pair.section}</td>
                    <td>{pair.item}</td>
                    <td>{pair.sellRate}</td>
                    <td>{pair.buyRate}</td>
                    <td>{pair.marginLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
