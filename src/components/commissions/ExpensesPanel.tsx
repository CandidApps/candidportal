'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { useCrmData } from '@/components/CrmDataProvider';
import { bmwDealsToCustomers, getBmwAgentRates, resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import { agentForCustomer } from '@/lib/commissions/commission-deal-prefill';
import {
  formatCommissionCurrency,
  formatPeriodLabel,
} from '@/lib/commissions/commission-store';
import {
  periodExpensesComplete,
  type CommissionAllocationType,
  type CommissionExpenseRow,
} from '@/lib/commissions/expense-review';
import { setExpensesComplete } from '@/lib/commissions/workflow-status';
import type { Customer } from '@/components/CustomersView';
import type { BmwAgentRate } from '@/lib/bmw/types';

type ExpenseDraft = {
  allocationType: CommissionAllocationType;
  customerId: string;
  customerName: string;
  customerAgent: string;
  commissionAgentId: string;
  deductionNote: string;
  rejectionNote: string;
};

function emptyDraft(): ExpenseDraft {
  return {
    allocationType: 'customer',
    customerId: '',
    customerName: '',
    customerAgent: '',
    commissionAgentId: '',
    deductionNote: '',
    rejectionNote: '',
  };
}

function draftFromExpense(e: CommissionExpenseRow): ExpenseDraft {
  return {
    allocationType: e.commission_allocation_type ?? 'customer',
    customerId: e.customer_id ?? '',
    customerName: e.customer_name ?? '',
    customerAgent: e.customer_agent ?? '',
    commissionAgentId: e.commission_agent_id ?? '',
    deductionNote: e.commission_deduction_note ?? '',
    rejectionNote: e.commission_rejection_note ?? '',
  };
}

function statusLabel(status: CommissionExpenseRow['commission_review_status']): string {
  if (status === 'included') return 'Included';
  if (status === 'rejected') return 'Rejected';
  return 'Pending review';
}

function statusClass(status: CommissionExpenseRow['commission_review_status']): string {
  if (status === 'included') return 'comm-expense-status--included';
  if (status === 'rejected') return 'comm-expense-status--rejected';
  return 'comm-expense-status--pending';
}

function ExpenseReviewRow({
  expense,
  period,
  customers,
  agents,
  onUpdated,
}: {
  expense: CommissionExpenseRow;
  period: string;
  customers: Customer[];
  agents: BmwAgentRate[];
  onUpdated: () => void;
}) {
  const [draft, setDraft] = useState<ExpenseDraft>(() => draftFromExpense(expense));
  const [customerQuery, setCustomerQuery] = useState(expense.customer_name ?? '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    setDraft(draftFromExpense(expense));
    setCustomerQuery(expense.customer_name ?? '');
    setShowReject(false);
    setError('');
  }, [expense]);

  const accountMatches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.company.toLowerCase().includes(q)
          || (c.agent ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [customers, customerQuery]);

  const selectCustomer = (c: Customer) => {
    let agentProfile = agentForCustomer(c, agents);
    if (!agentProfile && c.agent) {
      agentProfile = agents.find((a) => a.name === c.agent || a.id === c.agent) ?? null;
    }
    const agentName = agentProfile?.name ?? c.agent ?? '';
    setDraft((d) => ({
      ...d,
      allocationType: 'customer',
      customerId: c.id,
      customerName: c.company,
      customerAgent: agentName,
      commissionAgentId: agentProfile?.id ?? '',
    }));
    setCustomerQuery(c.company);
    setShowSuggestions(false);
  };

  const clearCustomer = () => {
    setDraft((d) => ({
      ...d,
      customerId: '',
      customerName: '',
      customerAgent: '',
      commissionAgentId: '',
    }));
    setCustomerQuery('');
  };

  const submitReview = async (decision: 'include' | 'reject') => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'review',
          id: expense.id,
          decision,
          commissionPeriod: period,
          allocationType: draft.allocationType,
          customerId: draft.customerId || null,
          customerName: draft.customerName || null,
          customerAgent: draft.customerAgent || null,
          commissionAgentId: draft.commissionAgentId || null,
          deductionNote: draft.deductionNote || null,
          rejectionNote: decision === 'reject' ? draft.rejectionNote : null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Review failed');
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save review.');
    } finally {
      setBusy(false);
    }
  };

  const isResolved =
    expense.commission_review_status === 'included'
    || expense.commission_review_status === 'rejected';

  return (
    <div className={`comm-expense-review${isResolved ? ' comm-expense-review--resolved' : ''}`}>
      <div className="comm-expense-review-head">
        <div>
          <div className="comm-expense-review-title">
            {expense.merchant ?? 'Expense'}
            {expense.bank_deposit_import_id != null && (
              <span className="comm-expense-source-badge">Bank deposit</span>
            )}
          </div>
          <div className="comm-expense-review-meta">
            {[expense.spent_on, expense.category, expense.note].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="comm-expense-review-right">
          <span className={`comm-expense-status ${statusClass(expense.commission_review_status)}`}>
            {statusLabel(expense.commission_review_status)}
          </span>
          <span className="comm-expense-review-amount">
            {formatCommissionCurrency(Number(expense.amount) || 0)}
          </span>
        </div>
      </div>

      {isResolved ? (
        <div className="comm-expense-review-summary">
          {expense.commission_review_status === 'included' && (
            <>
              {expense.commission_allocation_type === 'customer' ? (
                <span>
                  Deduct from{' '}
                  <strong>{expense.customer_name ?? 'customer'}</strong>
                  {expense.commission_agent_id ? (
                    <> ({resolveAgentDisplayName(expense.commission_agent_id)})</>
                  ) : expense.customer_agent ? (
                    <> ({expense.customer_agent})</>
                  ) : null}
                </span>
              ) : (
                <span>
                  Agent fee —{' '}
                  <strong>
                    {expense.commission_agent_id
                      ? resolveAgentDisplayName(expense.commission_agent_id)
                      : 'Agent'}
                  </strong>
                  {expense.commission_deduction_note ? `: ${expense.commission_deduction_note}` : null}
                </span>
              )}
            </>
          )}
          {expense.commission_review_status === 'rejected' && expense.commission_rejection_note && (
            <span>Rejected: {expense.commission_rejection_note}</span>
          )}
        </div>
      ) : (
        <>
          <div className="comm-expense-allocation">
            <span className="comm-expense-allocation-label">Allocation</span>
            <label className="comm-expense-allocation-opt">
              <input
                type="radio"
                name={`alloc-${expense.id}`}
                checked={draft.allocationType === 'customer'}
                onChange={() => setDraft((d) => ({ ...d, allocationType: 'customer' }))}
              />
              Customer (deduct from agent&apos;s commission for this account)
            </label>
            <label className="comm-expense-allocation-opt">
              <input
                type="radio"
                name={`alloc-${expense.id}`}
                checked={draft.allocationType === 'agent_fee'}
                onChange={() =>
                  setDraft((d) => ({
                    ...d,
                    allocationType: 'agent_fee',
                    customerId: '',
                    customerName: '',
                    customerAgent: '',
                  }))
                }
              />
              Agent fee (arbitrary charge to an agent)
            </label>
          </div>

          {draft.allocationType === 'customer' ? (
            <div className="settings-field" style={{ marginTop: 12 }}>
              <label className="settings-field-label">Customer</label>
              {draft.customerId ? (
                <div className="expense-account-chip">
                  <span className="expense-account-chip-name">
                    <AppIcon name="building" size={12} /> {draft.customerName}
                    {draft.customerAgent ? (
                      <span className="expense-account-chip-agent"> · {draft.customerAgent}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="expense-account-chip-clear"
                    onClick={clearCustomer}
                    aria-label="Clear customer"
                  >
                    <AppIcon name="close" size={11} />
                  </button>
                </div>
              ) : (
                <div className="expense-account-search">
                  <input
                    className="settings-input"
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder={customers.length ? 'Search accounts…' : 'No accounts loaded'}
                    disabled={customers.length === 0}
                  />
                  {showSuggestions && accountMatches.length > 0 && (
                    <div className="expense-account-suggestions" role="listbox">
                      {accountMatches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="expense-account-suggestion"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectCustomer(c)}
                        >
                          <span className="expense-account-suggestion-name">{c.company}</span>
                          {c.agent ? (
                            <span className="expense-account-suggestion-agent">{c.agent}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="settings-invite-grid" style={{ marginTop: 12 }}>
              <div className="settings-field">
                <label className="settings-field-label">Agent</label>
                <select
                  className="settings-input"
                  value={draft.commissionAgentId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, commissionAgentId: e.target.value }))
                  }
                >
                  <option value="">Select agent…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Fee description</label>
                <input
                  className="settings-input"
                  value={draft.deductionNote}
                  onChange={(e) => setDraft((d) => ({ ...d, deductionNote: e.target.value }))}
                  placeholder="What is this fee for?"
                />
              </div>
            </div>
          )}

          {showReject ? (
            <div className="comm-expense-reject-box">
              <label className="settings-field-label">Rejection note (required)</label>
              <textarea
                className="settings-input"
                rows={2}
                value={draft.rejectionNote}
                onChange={(e) => setDraft((d) => ({ ...d, rejectionNote: e.target.value }))}
                placeholder="Why is this expense excluded from commission?"
              />
              <div className="comm-expense-review-actions">
                <button
                  type="button"
                  className="admin-ticket-btn"
                  disabled={busy}
                  onClick={() => setShowReject(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-ticket-btn danger"
                  disabled={busy || !draft.rejectionNote.trim()}
                  onClick={() => void submitReview('reject')}
                >
                  Confirm reject
                </button>
              </div>
            </div>
          ) : (
            <div className="comm-expense-review-actions">
              <button
                type="button"
                className="admin-ticket-btn primary"
                disabled={busy}
                onClick={() => void submitReview('include')}
              >
                Include
              </button>
              <button
                type="button"
                className="admin-ticket-btn"
                disabled={busy}
                onClick={() => setShowReject(true)}
              >
                Reject
              </button>
            </div>
          )}

          {error && <div className="settings-form-error">{error}</div>}
        </>
      )}
    </div>
  );
}

export function ExpensesPanel({
  period,
  latestPeriod,
}: {
  period: string;
  latestPeriod: string;
}) {
  const { ready, agentRates, bmwDeals } = useCrmData();
  const [expenses, setExpenses] = useState<CommissionExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);

  const agents = useMemo(
    () =>
      ready
        ? getBmwAgentRates()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [ready, agentRates],
  );
  const customers = useMemo(
    () => (ready ? bmwDealsToCustomers() : []),
    [ready, bmwDeals],
  );

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/expenses?period=${encodeURIComponent(period)}&latestPeriod=${encodeURIComponent(latestPeriod)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setExpenses([]);
        return;
      }
      const json = (await res.json()) as { expenses?: CommissionExpenseRow[] };
      const rows = json.expenses ?? [];
      setExpenses(rows);
      setExpensesComplete(period, periodExpensesComplete(rows));
    } catch {
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [period, latestPeriod]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    const onUpdate = () => void loadExpenses();
    window.addEventListener('candid-commissions-updated', onUpdate);
    return () => window.removeEventListener('candid-commissions-updated', onUpdate);
  }, [loadExpenses]);

  const onUpdated = () => {
    window.dispatchEvent(new Event('candid-commissions-updated'));
    void loadExpenses();
  };

  const complete = periodExpensesComplete(expenses);
  const pendingCount = expenses.filter((e) => e.commission_review_status === 'pending').length;
  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Expenses — {formatPeriodLabel(period)}</div>
          {complete && (
            <span className="comm-workflow-badge comm-workflow-badge--done">Step complete</span>
          )}
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0, lineHeight: 1.55 }}>
            Final review before agent payments. Assign each expense to a customer (shows on the
            agent&apos;s report and deducts from their commission) or as a direct agent fee with a
            note. Recurring expenses auto-fill from prior months. Include or reject each line — this
            step completes when none are pending.
          </p>

          {!loading && expenses.length > 0 && (
            <p className="comm-expense-progress" style={{ marginTop: 12, marginBottom: 0 }}>
              {complete
                ? 'All expenses reviewed for this period.'
                : `${pendingCount} expense${pendingCount === 1 ? '' : 's'} awaiting review`}
              {' · '}
              Total {formatCommissionCurrency(total)}
            </p>
          )}

          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 14, marginBottom: 0 }}>
              Loading expenses…
            </p>
          ) : expenses.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 14, marginBottom: 0 }}>
              No expenses recorded for this period yet.
            </p>
          ) : (
            <div className="comm-expense-review-list">
              {expenses.map((e) => (
                <ExpenseReviewRow
                  key={e.id}
                  expense={e}
                  period={period}
                  customers={customers}
                  agents={agents}
                  onUpdated={onUpdated}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExpensesPanel;
