'use client';

import { useEffect, useMemo, useState } from 'react';
import { fmt$ } from '@/lib/candid-pay/pricingEngine';
import type { UcaasCatalogRecord, UcaasQuoteLine, UcaasQuoteSnapshot } from '@/lib/ucaas/types';
import { fetchUcaasCatalogs } from '@/lib/ucaas/catalogs-client';
import { buildQuoteSnapshotFromCatalog, computeUcaasQuote } from '@/lib/ucaas/quote-engine';

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function lineSubtotal(l: UcaasQuoteLine): number {
  return l.flat ? l.unitPrice : l.quantity * l.unitPrice;
}

export function UcaasQuoteBuilder({
  value,
  defaultCurrentSpend,
  onChange,
  onRemove,
}: {
  value?: UcaasQuoteSnapshot;
  defaultCurrentSpend?: number;
  onChange: (next: UcaasQuoteSnapshot) => void;
  onRemove: () => void;
}) {
  const [catalogs, setCatalogs] = useState<UcaasCatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await fetchUcaasCatalogs();
        if (!cancelled) setCatalogs(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load catalogs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(
    () =>
      value
        ? computeUcaasQuote({
            lines: value.lines,
            fees: value.fees,
            setupTaxes: value.setupTaxes,
            monthlyTaxRatePct: value.monthlyTaxRatePct,
            currentMonthlySpend: value.currentMonthlySpend,
          })
        : null,
    [value],
  );

  const startFromCatalog = (catalogId: string) => {
    const rec = catalogs.find((c) => c.id === catalogId);
    if (!rec) return;
    onChange(
      buildQuoteSnapshotFromCatalog({
        catalogId: rec.id,
        catalogName: rec.name,
        providerName: rec.providerName,
        catalog: rec.catalog,
        currentMonthlySpend: defaultCurrentSpend ?? 0,
      }),
    );
  };

  const updateLine = (itemId: string, patch: Partial<UcaasQuoteLine>) => {
    if (!value) return;
    onChange({
      ...value,
      lines: value.lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)),
    });
  };

  const updateSetupTax = (idx: number, amount: number) => {
    if (!value) return;
    onChange({
      ...value,
      setupTaxes: value.setupTaxes.map((t, i) => (i === idx ? { ...t, amount } : t)),
    });
  };

  if (loading) {
    return <div className="uqb">Loading UCaaS catalogs…</div>;
  }

  if (!value) {
    return (
      <div className="uqb">
        <div className="uqb-head">
          <div>
            <div className="uqb-title">UCaaS quote</div>
            <div className="uqb-sub">Build a structured phone-system quote with live savings.</div>
          </div>
        </div>
        {error && <div className="uqb-error">{error}</div>}
        {catalogs.length === 0 ? (
          <div className="uqb-empty">
            No UCaaS catalogs found. Add one on a UCaaS supplier&rsquo;s “UCaaS catalog” tab first.
          </div>
        ) : (
          <div className="uqb-start">
            <label className="uqb-field">
              <span>Start from catalog</span>
              <select
                defaultValue=""
                onChange={(e) => e.target.value && startFromCatalog(e.target.value)}
              >
                <option value="" disabled>
                  Choose a catalog…
                </option>
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.providerName} — {c.name}
                    {c.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    );
  }

  const setupLines = value.lines.filter((l) => l.section === 'setup');
  const monthlyLines = value.lines.filter((l) => l.section === 'monthly');

  const renderItemRows = (lines: UcaasQuoteLine[]) =>
    lines.map((l) => (
      <tr key={l.itemId}>
        <td className="uqb-cell-name">{l.name}</td>
        <td className="uqb-cell-num">
          {l.flat ? (
            <span className="uqb-muted">—</span>
          ) : (
            <input
              type="number"
              className="uqb-input uqb-input-sm"
              value={l.quantity}
              min={0}
              onChange={(e) => updateLine(l.itemId, { quantity: num(e.target.value) })}
            />
          )}
        </td>
        <td className="uqb-cell-num">
          <input
            type="number"
            className="uqb-input uqb-input-sm"
            value={l.unitPrice}
            step="0.01"
            onChange={(e) => updateLine(l.itemId, { unitPrice: num(e.target.value) })}
          />
        </td>
        <td className="uqb-cell-num uqb-cell-subtotal">{fmt$(lineSubtotal(l))}</td>
      </tr>
    ));

  return (
    <div className="uqb">
      <div className="uqb-head">
        <div>
          <div className="uqb-title">UCaaS quote — {value.providerName}</div>
          <div className="uqb-sub">{value.catalogName}</div>
        </div>
        <button type="button" className="btn-secondary uqb-remove" onClick={onRemove}>
          Remove quote
        </button>
      </div>

      {/* One-time setup */}
      <div className="uqb-section-title">One-time setup</div>
      <table className="uqb-table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="uqb-cell-num">Qty</th>
            <th className="uqb-cell-num">Unit price</th>
            <th className="uqb-cell-num">Subtotal</th>
          </tr>
        </thead>
        <tbody>{renderItemRows(setupLines)}</tbody>
      </table>

      <div className="uqb-tax-grid">
        {value.setupTaxes.map((t, i) => (
          <label key={t.label} className="uqb-field">
            <span>{t.label}</span>
            <input
              type="number"
              className="uqb-input"
              value={t.amount}
              step="0.01"
              onChange={(e) => updateSetupTax(i, num(e.target.value))}
            />
          </label>
        ))}
      </div>

      {totals && (
        <div className="uqb-subtotals">
          <div>
            <span>Setup subtotal</span>
            <strong>{fmt$(totals.setupSubtotalPreTax)}</strong>
          </div>
          <div>
            <span>Setup taxes</span>
            <strong>{fmt$(totals.setupTaxTotal)}</strong>
          </div>
          <div className="uqb-subtotals-total">
            <span>Total one-time setup</span>
            <strong>{fmt$(totals.setupTotal)}</strong>
          </div>
        </div>
      )}

      {/* Recurring monthly */}
      <div className="uqb-section-title">Recurring monthly</div>
      <table className="uqb-table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="uqb-cell-num">Qty</th>
            <th className="uqb-cell-num">Unit price</th>
            <th className="uqb-cell-num">Subtotal</th>
          </tr>
        </thead>
        <tbody>{renderItemRows(monthlyLines)}</tbody>
      </table>

      {totals && (
        <>
          <div className="uqb-fees">
            <div className="uqb-fees-title">Fees (auto-calculated)</div>
            {totals.monthlyFees.map((f) => (
              <div key={f.id} className="uqb-fee-row">
                <span>{f.name}</span>
                <strong>{fmt$(f.amount)}</strong>
              </div>
            ))}
          </div>

          <div className="uqb-subtotals">
            <div>
              <span>Monthly subtotal (items + fees)</span>
              <strong>{fmt$(totals.monthlySubtotalPreTax)}</strong>
            </div>
            <div>
              <span>Taxes estimate ({value.monthlyTaxRatePct}%)</span>
              <strong>{fmt$(totals.monthlyTax)}</strong>
            </div>
            <div className="uqb-subtotals-total">
              <span>Estimated monthly price</span>
              <strong>{fmt$(totals.monthlyTotal)}</strong>
            </div>
          </div>

          <div className="uqb-savings">
            <label className="uqb-field">
              <span>Customer current monthly spend</span>
              <input
                type="number"
                className="uqb-input"
                value={value.currentMonthlySpend}
                step="0.01"
                onChange={(e) => onChange({ ...value, currentMonthlySpend: num(e.target.value) })}
              />
            </label>
            <div className={`uqb-savings-result${totals.monthlySavings >= 0 ? '' : ' uqb-savings-result--neg'}`}>
              <div>
                <span>Monthly savings</span>
                <strong>{fmt$(totals.monthlySavings)}</strong>
              </div>
              <div>
                <span>Annual savings</span>
                <strong>{fmt$(totals.annualSavings)}</strong>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
