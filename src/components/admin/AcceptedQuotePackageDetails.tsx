'use client';

import type { QuotePackageSummary } from '@/lib/quotes/quote-package-summary';

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

type AcceptedQuotePackageDetailsProps = {
  pkg: QuotePackageSummary;
};

export function AcceptedQuotePackageDetails({ pkg }: AcceptedQuotePackageDetailsProps) {
  const setup = pkg.lines.filter((l) => l.section === 'setup');
  const monthly = pkg.lines.filter((l) => l.section === 'monthly');

  return (
    <div className="accepted-quote-package">
      <div className="accepted-quote-package-summary">
        {pkg.seatCount != null ? (
          <span>
            <strong>{pkg.seatCount}</strong> seats
          </span>
        ) : null}
        {pkg.monthlyTotal != null ? (
          <span>
            Monthly <strong>{money(pkg.monthlyTotal)}</strong>
          </span>
        ) : null}
        {pkg.setupTotal != null ? (
          <span>
            Setup <strong>{money(pkg.setupTotal)}</strong>
          </span>
        ) : null}
        {pkg.annualSavings != null && pkg.annualSavings > 0 ? (
          <span>
            Est. annual savings <strong>{money(pkg.annualSavings)}</strong>
          </span>
        ) : null}
      </div>

      {monthly.length > 0 ? (
        <div className="accepted-quote-package-section">
          <div className="ticket-detail-field-label">Monthly package</div>
          <table className="accepted-quote-package-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((line) => (
                <tr key={`m-${line.name}-${line.quantity}-${line.unitPrice}`}>
                  <td>{line.name}</td>
                  <td>{line.flat ? '—' : line.quantity}</td>
                  <td>{money(line.unitPrice)}</td>
                  <td>{money(line.subtotal)}</td>
                </tr>
              ))}
              {pkg.fees.map((fee) => (
                <tr key={`fee-${fee.name}`}>
                  <td>{fee.name}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{money(fee.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pkg.monthlyTax != null ? (
            <div className="accepted-quote-package-note">
              Est. tax
              {pkg.monthlyTaxRatePct != null ? ` (~${pkg.monthlyTaxRatePct.toFixed(1)}%)` : ''}:{' '}
              {money(pkg.monthlyTax)}
            </div>
          ) : null}
        </div>
      ) : null}

      {setup.length > 0 ? (
        <div className="accepted-quote-package-section">
          <div className="ticket-detail-field-label">One-time / setup</div>
          <table className="accepted-quote-package-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {setup.map((line) => (
                <tr key={`s-${line.name}-${line.quantity}-${line.unitPrice}`}>
                  <td>{line.name}</td>
                  <td>{line.flat ? '—' : line.quantity}</td>
                  <td>{money(line.unitPrice)}</td>
                  <td>{money(line.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {pkg.currentMonthlySpend != null && pkg.currentMonthlySpend > 0 ? (
        <div className="accepted-quote-package-note">
          Current spend {money(pkg.currentMonthlySpend)}
          {pkg.monthlySavings != null && pkg.monthlySavings > 0
            ? ` · Est. monthly savings ${money(pkg.monthlySavings)}`
            : ''}
        </div>
      ) : null}
    </div>
  );
}
