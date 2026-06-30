'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  formatCommissionCurrency,
  formatPeriodLabel,
} from '@/lib/commissions/commission-store';
import {
  readExpensesComplete,
  setExpensesComplete,
} from '@/lib/commissions/workflow-status';

type PeriodExpense = {
  id: string;
  merchant: string | null;
  category: string | null;
  amount: number;
  spent_on: string | null;
  note: string | null;
  bank_deposit_import_id: number | null;
};

export function ExpensesPanel({ period }: { period: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [expenses, setExpenses] = useState<PeriodExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/expenses?period=${encodeURIComponent(period)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setExpenses([]);
        return;
      }
      const json = (await res.json()) as { expenses?: PeriodExpense[] };
      setExpenses(json.expenses ?? []);
    } catch {
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setConfirmed(readExpensesComplete(period));
    void loadExpenses();
  }, [period, loadExpenses]);

  useEffect(() => {
    const onUpdate = () => void loadExpenses();
    window.addEventListener('candid-commissions-updated', onUpdate);
    return () => window.removeEventListener('candid-commissions-updated', onUpdate);
  }, [loadExpenses]);

  const toggleConfirmed = () => {
    const next = !confirmed;
    setExpensesComplete(period, next);
    setConfirmed(next);
  };

  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

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
            issuing agent payments. Bank deposit lines classified as <strong>Expense</strong>{' '}
            appear here automatically and in your My Expenses tab.
          </p>

          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 14, marginBottom: 0 }}>
              Loading expenses…
            </p>
          ) : expenses.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 14, marginBottom: 0 }}>
              No expenses recorded for this period yet.
            </p>
          ) : (
            <table className="admin-mini-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant / source</th>
                  <th>Category</th>
                  <th>Note</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.spent_on ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>
                      {e.merchant ?? '—'}
                      {e.bank_deposit_import_id != null && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'var(--gray)',
                            background: 'var(--surface-muted)',
                            border: '1px solid var(--gray-border)',
                            borderRadius: 999,
                            padding: '2px 8px',
                          }}
                        >
                          Bank deposit
                        </span>
                      )}
                    </td>
                    <td>{e.category ?? '—'}</td>
                    <td style={{ maxWidth: 320, fontSize: 12, color: 'var(--gray)' }}>{e.note ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {formatCommissionCurrency(Number(e.amount) || 0)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {formatCommissionCurrency(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          <div className="comm-expenses-confirm" style={{ marginTop: 20 }}>
            <label className="comm-check-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={toggleConfirmed}
              />
              {confirmed
                ? 'Expenses confirmed for this period'
                : expenses.length === 0
                  ? 'No expenses this period — mark step complete'
                  : 'Expenses reviewed — mark step complete'}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExpensesPanel;
