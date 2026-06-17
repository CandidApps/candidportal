'use client';

import { useEffect, useState } from 'react';
import {
  formatPeriodLabel,
} from '@/lib/commissions/commission-store';
import {
  readExpensesComplete,
  setExpensesComplete,
} from '@/lib/commissions/workflow-status';

export function ExpensesPanel({ period }: { period: string }) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setConfirmed(readExpensesComplete(period));
  }, [period]);

  const toggleConfirmed = () => {
    const next = !confirmed;
    setExpensesComplete(period, next);
    setConfirmed(next);
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Expenses — {formatPeriodLabel(period)}</div>
          {confirmed && (
            <span className="comm-workflow-badge comm-workflow-badge--done">Step complete</span>
          )}
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0, lineHeight: 1.55 }}>
            After bank deposits are reconciled and supplier reports are verified, record
            commission-related expenses here — chargebacks, adjustments, and fees — before
            issuing agent payments.
          </p>
          <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 14, marginBottom: 0 }}>
            No expenses recorded for this period yet.
          </p>
          <div className="comm-expenses-confirm" style={{ marginTop: 20 }}>
            <label className="comm-check-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={toggleConfirmed}
              />
              {confirmed
                ? 'Expenses confirmed for this period'
                : 'No expenses this period — mark step complete'}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExpensesPanel;
