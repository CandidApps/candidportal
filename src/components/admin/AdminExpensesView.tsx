'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AdminExpense } from '@/app/api/admin/expenses/route';

const CATEGORIES = ['Travel', 'Meals', 'Software', 'Marketing', 'Office', 'Client gift', 'Other'];

const fmt$ = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Admin "My Expenses" — manual logging, receipts, customer association, and an
 *  option to pull an expense out of an agent's commission (TASK-032). */
export function AdminExpensesView() {
  const [expenses, setExpenses] = useState<AdminExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState('');
  const [note, setNote] = useState('');
  const [pullFromCommission, setPullFromCommission] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/expenses');
      if (res.ok) {
        const data = (await res.json()) as { expenses?: AdminExpense[] };
        setExpenses(data.expenses ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setMerchant('');
    setCustomerName('');
    setCategory(CATEGORIES[0]);
    setAmount('');
    setSpentOn('');
    setNote('');
    setPullFromCommission(false);
    setReceipt(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      form.set('merchant', merchant);
      form.set('customerName', customerName);
      form.set('category', category);
      form.set('amount', String(amt));
      form.set('spentOn', spentOn);
      form.set('note', note);
      form.set('pullFromCommission', String(pullFromCommission));
      if (receipt) form.set('receipt', receipt);
      const res = await fetch('/api/admin/expenses', { method: 'POST', body: form });
      if (!res.ok) throw new Error('save failed');
      reset();
      await load();
    } catch {
      setError('Could not save the expense. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/admin/expenses?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  };

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <>
      <div className="greeting">
        <h2>My <span style={{ color: 'var(--red)' }}>Expenses</span></h2>
        <p>Log expenses and attach receipts. Associate a merchant/customer and optionally pull the expense out of commission.</p>
      </div>

      <div className="settings-grid">
        <div className="card">
          <div className="card-header"><div className="card-title">Log an expense</div></div>
          <div className="card-body">
            <div className="settings-field">
              <label className="settings-field-label">Merchant / vendor</label>
              <input className="settings-input" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. United Airlines" />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Associated customer (optional)</label>
              <input className="settings-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer / account name" />
            </div>
            <div className="settings-invite-grid">
              <div className="settings-field">
                <label className="settings-field-label">Category</label>
                <select className="settings-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Amount</label>
                <input className="settings-input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Date</label>
                <input className="settings-input" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Note</label>
              <textarea className="settings-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">Receipt</label>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.heic" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
            </div>
            <label className="settings-checkbox-row">
              <input type="checkbox" checked={pullFromCommission} onChange={(e) => setPullFromCommission(e.target.checked)} />
              <span>Pull this expense out of commission (for agents)</span>
            </label>
            {error && <div className="settings-form-error">{error}</div>}
            <button type="button" className="btn-primary settings-save-btn" disabled={saving} onClick={() => void submit()}>
              {saving ? 'Saving…' : 'Log expense'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Logged expenses</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-dark)' }}>Total {fmt$(total)}</div>
          </div>
          <div className="card-body">
            <p className="settings-section-desc">
              Zoho Expense sync is available once Zoho Expense API credentials are configured for the workspace; until then expenses are stored in Candid.
            </p>
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading…</p>
            ) : expenses.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No expenses logged yet.</p>
            ) : (
              <div className="expense-list">
                {expenses.map((e) => (
                  <div key={e.id} className="expense-row">
                    <div className="expense-main">
                      <div className="expense-top">
                        <span className="expense-merchant">{e.merchant || e.category || 'Expense'}</span>
                        <span className="expense-amount">{fmt$(Number(e.amount || 0))}</span>
                      </div>
                      <div className="expense-meta">
                        {[e.category, e.customer_name, e.spent_on].filter(Boolean).join(' · ')}
                        {e.pull_from_commission ? ' · Pulled from commission' : ''}
                      </div>
                      {e.note && <div className="expense-note">{e.note}</div>}
                    </div>
                    <button type="button" className="assist-mini-btn danger" onClick={() => void remove(e.id)} aria-label="Delete expense">
                      <AppIcon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
