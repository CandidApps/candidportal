'use client';

import { useMemo, useState } from 'react';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import type { UcaasQuoteLine } from '@/lib/ucaas/types';
import { computeUcaasQuote } from '@/lib/ucaas/quote-engine';
import { fmt$ } from '@/lib/candid-pay/pricingEngine';
import { shouldShowSupplierName } from '@/lib/analysis/customer-supplier-display';

function lineSubtotal(l: UcaasQuoteLine): number {
  return l.flat ? l.unitPrice : l.quantity * l.unitPrice;
}

export function MemberUcaasProposal({
  snapshot,
  onBack,
}: {
  snapshot: PublishedAnalysisSnapshot;
  onBack: () => void;
}) {
  const quote = snapshot.ucaasQuote;
  const showSupplier = shouldShowSupplierName(snapshot.showSupplierName);
  const proposalTitle = showSupplier ? quote?.providerName ?? 'Your proposal' : 'Your phone system proposal';
  const [lines, setLines] = useState<UcaasQuoteLine[]>(() => quote?.lines ?? []);

  const totals = useMemo(() => {
    if (!quote) return null;
    return computeUcaasQuote({
      lines,
      fees: quote.fees,
      setupTaxes: quote.setupTaxes,
      monthlyTaxRatePct: quote.monthlyTaxRatePct,
      currentMonthlySpend: quote.currentMonthlySpend,
    });
  }, [lines, quote]);

  if (!quote || !totals) {
    return (
      <div className="proposal-analysis-embed">
        <div className="proposal-analysis-header">
          <h2 className="proposal-analysis-title">{snapshot.vendorName}</h2>
          <button type="button" className="btn-secondary" onClick={onBack}>
            Back
          </button>
        </div>
        <div className="msp-callout msp-callout--info">Quote is not available.</div>
      </div>
    );
  }

  const includedSetup = lines.filter((l) => l.section === 'setup' && lineSubtotal(l) !== 0);
  const includedMonthly = lines.filter(
    (l) => l.section === 'monthly' && (l.quantity > 0 || lineSubtotal(l) !== 0),
  );
  const optionalAddons = lines.filter(
    (l) => l.section === 'monthly' && l.quantity === 0 && l.unitPrice > 0 && !l.flat,
  );

  const setQty = (itemId: string, quantity: number) =>
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, quantity: Math.max(0, quantity) } : l)),
    );

  return (
    <div className="proposal-analysis-embed muq">
      <div className="proposal-analysis-header">
        <div>
          <div className="proposal-analysis-eyebrow">Your phone system proposal</div>
          <h2 className="proposal-analysis-title">{proposalTitle}</h2>
          <div className="proposal-analysis-meta">{snapshot.categoriesLabel ?? snapshot.categoryLabel}</div>
        </div>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
      </div>

      {snapshot.adminMessage && (
        <div className="msp-callout msp-callout--info" style={{ marginBottom: 16, textAlign: 'left' }}>
          {snapshot.adminMessage}
        </div>
      )}

      {/* Savings hero */}
      <div className="muq-hero">
        <div className="muq-hero-card muq-hero-card--primary">
          <span className="muq-hero-label">Estimated annual savings</span>
          <span className="muq-hero-value">{fmt$(Math.max(0, totals.annualSavings))}</span>
          <span className="muq-hero-sub">{fmt$(Math.max(0, totals.monthlySavings))}/mo vs. current</span>
        </div>
        <div className="muq-hero-card">
          <span className="muq-hero-label">New monthly price</span>
          <span className="muq-hero-value">{fmt$(totals.monthlyTotal)}</span>
          <span className="muq-hero-sub">incl. est. taxes &amp; fees</span>
        </div>
        <div className="muq-hero-card">
          <span className="muq-hero-label">Current monthly spend</span>
          <span className="muq-hero-value">{fmt$(totals.currentMonthlySpend)}</span>
          <span className="muq-hero-sub">what you pay today</span>
        </div>
      </div>

      {/* Build your package */}
      {optionalAddons.length > 0 && (
        <div className="muq-section">
          <div className="muq-section-title">Build your package</div>
          <div className="muq-section-sub">
            Add optional features to see how they affect your monthly price.
          </div>
          <div className="muq-addons">
            {optionalAddons.map((l) => (
              <button
                key={l.itemId}
                type="button"
                className="muq-addon"
                onClick={() => setQty(l.itemId, 1)}
              >
                <span className="muq-addon-name">{l.name}</span>
                <span className="muq-addon-price">+{fmt$(l.unitPrice)}/mo</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly breakdown */}
      <div className="muq-section">
        <div className="muq-section-title">Monthly service</div>
        <table className="muq-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th className="muq-num">Qty</th>
              <th className="muq-num">Unit</th>
              <th className="muq-num">Monthly</th>
            </tr>
          </thead>
          <tbody>
            {includedMonthly.map((l) => (
              <tr key={l.itemId}>
                <td>{l.name}</td>
                <td className="muq-num">
                  {l.flat ? (
                    '—'
                  ) : (
                    <span className="muq-stepper">
                      <button type="button" onClick={() => setQty(l.itemId, l.quantity - 1)} aria-label="Decrease">
                        −
                      </button>
                      <span>{l.quantity}</span>
                      <button type="button" onClick={() => setQty(l.itemId, l.quantity + 1)} aria-label="Increase">
                        +
                      </button>
                    </span>
                  )}
                </td>
                <td className="muq-num">{fmt$(l.unitPrice)}</td>
                <td className="muq-num">{fmt$(lineSubtotal(l))}</td>
              </tr>
            ))}
            {totals.monthlyFees
              .filter((f) => f.amount !== 0)
              .map((f) => (
                <tr key={f.id} className="muq-fee">
                  <td>{f.name}</td>
                  <td className="muq-num">—</td>
                  <td className="muq-num">—</td>
                  <td className="muq-num">{fmt$(f.amount)}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Subtotal</td>
              <td className="muq-num">{fmt$(totals.monthlySubtotalPreTax)}</td>
            </tr>
            <tr>
              <td colSpan={3}>Estimated taxes ({quote.monthlyTaxRatePct}%)</td>
              <td className="muq-num">{fmt$(totals.monthlyTax)}</td>
            </tr>
            <tr className="muq-total">
              <td colSpan={3}>Estimated monthly price</td>
              <td className="muq-num">{fmt$(totals.monthlyTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* One-time setup */}
      {includedSetup.length > 0 && (
        <div className="muq-section">
          <div className="muq-section-title">One-time setup</div>
          <table className="muq-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="muq-num">Qty</th>
                <th className="muq-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {includedSetup.map((l) => (
                <tr key={l.itemId}>
                  <td>{l.name}</td>
                  <td className="muq-num">{l.flat ? '—' : l.quantity}</td>
                  <td className="muq-num">{fmt$(lineSubtotal(l))}</td>
                </tr>
              ))}
              {totals.setupTaxTotal !== 0 && (
                <tr>
                  <td>Taxes</td>
                  <td className="muq-num">—</td>
                  <td className="muq-num">{fmt$(totals.setupTaxTotal)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="muq-total">
                <td colSpan={2}>Total one-time setup</td>
                <td className="muq-num">{fmt$(totals.setupTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="muq-disclaimer">
        Taxes are estimates and may vary based on jurisdiction and final configuration.
      </div>
    </div>
  );
}
