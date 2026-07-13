'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AdminExpense } from '@/app/api/admin/expenses/route';

export type ExpenseAccount = { id: string; company: string; agent?: string };

const CATEGORIES = ['Travel', 'Meals', 'Software', 'Marketing', 'Office', 'Client gift', 'Other'];

const fmt$ = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Admin "My Expenses" — manual logging, receipts, and optional queue for commission step 3 review. */
export function AdminExpensesView({ accounts = [] }: { accounts?: ExpenseAccount[] }) {
  const [expenses, setExpenses] = useState<AdminExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState('');
  // Customer association is a typed search of existing accounts (no free text),
  // so every expense links to a real account + its agent for tracking.
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAgent, setCustomerAgent] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState('');
  const [note, setNote] = useState('');
  const [queueForCommission, setQueueForCommission] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setReceipt(file);
  };

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

  const accountMatches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return accounts.slice(0, 8);
    return accounts
      .filter((a) => a.company.toLowerCase().includes(q) || (a.agent ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [accounts, customerQuery]);

  const selectAccount = (a: ExpenseAccount) => {
    setCustomerId(a.id);
    setCustomerName(a.company);
    setCustomerAgent(a.agent ?? '');
    setCustomerQuery(a.company);
    setShowAccountSuggestions(false);
  };

  const clearAccount = () => {
    setCustomerId('');
    setCustomerName('');
    setCustomerAgent('');
    setCustomerQuery('');
  };

  const reset = () => {
    setMerchant('');
    clearAccount();
    setCategory(CATEGORIES[0]);
    setAmount('');
    setSpentOn('');
    setNote('');
    setQueueForCommission(false);
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
      form.set('customerId', customerId);
      form.set('customerName', customerName);
      form.set('customerAgent', customerAgent);
      form.set('category', category);
      form.set('amount', String(amt));
      form.set('spentOn', spentOn);
      form.set('note', note);
      form.set('queueForCommission', String(queueForCommission));
      if (receipt) form.set('receipt', receipt);
      const res = await fetch('/api/admin/expenses', { method: 'POST', body: form });
      if (!res.ok) throw new Error('save failed');
      if (queueForCommission) {
        window.dispatchEvent(new Event('candid-commissions-updated'));
      }
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

  const [resubmittingId, setResubmittingId] = useState<string | null>(null);
  const resubmit = async (id: string) => {
    setResubmittingId(id);
    setError('');
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'review', id, decision: 'resubmit' }),
      });
      const json = (await res.json().catch(() => ({}))) as { expense?: AdminExpense; error?: string };
      if (!res.ok || !json.expense) throw new Error(json.error ?? 'Resubmit failed');
      window.dispatchEvent(new Event('candid-commissions-updated'));
      window.dispatchEvent(new Event('candid-expenses-updated'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resubmit expense.');
    } finally {
      setResubmittingId(null);
    }
  };

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const syncToZoho = async (id: string) => {
    setSyncingId(id);
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'sync', id }),
      });
      const json = (await res.json().catch(() => ({}))) as { expense?: AdminExpense; error?: string };
      if (!res.ok || !json.expense) throw new Error(json.error ?? 'Sync failed');
      setExpenses((prev) => prev.map((e) => (e.id === id ? json.expense! : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sync to Zoho.');
    } finally {
      setSyncingId(null);
    }
  };

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const importFromZoho = async () => {
    setImporting(true);
    setImportMsg('');
    setError('');
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'import' }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        imported?: number;
        scanned?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? 'Import failed');
      const n = json.imported ?? 0;
      setImportMsg(
        n === 0
          ? `No new expenses found in Zoho (${json.scanned ?? 0} scanned).`
          : `Imported ${n} new expense${n === 1 ? '' : 's'} from Zoho.`,
      );
      if (n > 0) await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import from Zoho.');
    } finally {
      setImporting(false);
    }
  };

  const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <>
      <div className="greeting">
        <h2>My <span style={{ color: 'var(--red)' }}>Expenses</span></h2>
        <p>Log expenses and attach receipts. Optionally queue an expense for commission period review (Step 3).</p>
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
              <label className="settings-field-label">Associated account (optional)</label>
              {customerId ? (
                <div className="expense-account-chip">
                  <span className="expense-account-chip-name">
                    <AppIcon name="building" size={12} /> {customerName}
                    {customerAgent ? <span className="expense-account-chip-agent"> · {customerAgent}</span> : null}
                  </span>
                  <button type="button" className="expense-account-chip-clear" onClick={clearAccount} aria-label="Clear account">
                    <AppIcon name="close" size={11} />
                  </button>
                </div>
              ) : (
                <div className="expense-account-search">
                  <input
                    className="settings-input"
                    value={customerQuery}
                    onChange={(e) => { setCustomerQuery(e.target.value); setShowAccountSuggestions(true); }}
                    onFocus={() => setShowAccountSuggestions(true)}
                    onBlur={() => window.setTimeout(() => setShowAccountSuggestions(false), 150)}
                    placeholder={accounts.length ? 'Search accounts…' : 'No accounts available'}
                    disabled={accounts.length === 0}
                  />
                  {showAccountSuggestions && accountMatches.length > 0 && (
                    <div className="expense-account-suggestions" role="listbox">
                      {accountMatches.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="expense-account-suggestion"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectAccount(a)}
                        >
                          <span className="expense-account-suggestion-name">{a.company}</span>
                          {a.agent ? <span className="expense-account-suggestion-agent">{a.agent}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                  {showAccountSuggestions && customerQuery.trim() && accountMatches.length === 0 && (
                    <div className="expense-account-suggestions">
                      <div className="expense-account-empty">No matching accounts.</div>
                    </div>
                  )}
                </div>
              )}
              <span className="expense-account-hint">Pick an existing account so the customer and agent are tracked.</span>
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
              <div
                className={`upload-zone expense-receipt-zone${dragOver ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.heic"
                  onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                />
                {receipt ? (
                  <div className="expense-receipt-picked">
                    <AppIcon name="file" size={18} />
                    <span className="expense-receipt-name">{receipt.name}</span>
                    <button
                      type="button"
                      className="expense-receipt-clear"
                      onClick={(e) => { e.stopPropagation(); setReceipt(null); if (fileRef.current) fileRef.current.value = ''; }}
                      aria-label="Remove receipt"
                    >
                      <AppIcon name="close" size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="expense-receipt-icon"><AppIcon name="download" size={22} /></div>
                    <div className="expense-receipt-title">Drag &amp; drop a receipt</div>
                    <div className="expense-receipt-sub">or click to browse · PDF, PNG, JPG, HEIC</div>
                  </>
                )}
              </div>
            </div>
            <label className="settings-checkbox-row">
              <input type="checkbox" checked={queueForCommission} onChange={(e) => setQueueForCommission(e.target.checked)} />
              <span>Add to commission period expenses (Step 3 review — does not deduct until approved)</span>
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
            <div className="expense-list-actions">
              <button
                type="button"
                className="assist-mini-btn"
                disabled={importing}
                onClick={() => void importFromZoho()}
              >
                <AppIcon name="download" size={11} className={importing ? 'spin' : undefined} />
                {importing ? 'Importing…' : 'Sync from Zoho'}
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-dark)' }}>Total {fmt$(total)}</span>
            </div>
          </div>
          <div className="card-body">
            <p className="settings-section-desc">
              Zoho Expense sync is available once Zoho Expense API credentials are configured for the workspace; until then expenses are stored in Candid. Use <strong>Sync from Zoho</strong> to pull in expenses you added directly in the Zoho app.
            </p>
            {importMsg && <div className="settings-form-note">{importMsg}</div>}
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading…</p>
            ) : expenses.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No expenses logged yet.</p>
            ) : (
              <div className="expense-list">
                {expenses.map((e) => {
                  const rejected = e.commission_review_status === 'rejected';
                  const statusLabel = rejected
                    ? 'Rejected — needs resubmit'
                    : e.commission_review_status === 'included'
                      ? `Included in ${e.commission_period ?? 'commission'}`
                      : e.commission_review_status === 'deferred'
                        ? `Deferred${e.commission_target_period ? ` → ${e.commission_target_period}` : ''}`
                        : (e.queued_for_commission || e.commission_period)
                          ? `Queued for ${e.commission_period ?? 'commission'} review`
                          : '';
                  return (
                  <div key={e.id} className={`expense-row${rejected ? ' expense-row--rejected' : ''}`}>
                    <div className="expense-main">
                      <div className="expense-top">
                        <span className="expense-merchant">{e.merchant || e.category || 'Expense'}</span>
                        <span className="expense-amount">{fmt$(Number(e.amount || 0))}</span>
                      </div>
                      <div className="expense-meta">
                        {[e.category, e.customer_name, e.customer_agent, e.spent_on].filter(Boolean).join(' · ')}
                        {statusLabel ? ` · ${statusLabel}` : ''}
                      </div>
                      {rejected && e.commission_rejection_note && (
                        <div className="expense-note" style={{ color: 'var(--red)' }}>
                          Rejection: {e.commission_rejection_note}
                        </div>
                      )}
                      {e.note && !rejected && <div className="expense-note">{e.note}</div>}
                      <div className="expense-sync" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {rejected && (
                          <button
                            type="button"
                            className="assist-mini-btn"
                            disabled={resubmittingId === e.id}
                            onClick={() => void resubmit(e.id)}
                          >
                            {resubmittingId === e.id ? 'Resubmitting…' : 'Edit & resubmit for review'}
                          </button>
                        )}
                        {e.zoho_expense_id ? (
                          <span className="expense-sync-badge expense-sync-badge--ok">
                            <AppIcon name="check" size={11} /> Synced to Zoho
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="assist-mini-btn"
                            disabled={syncingId === e.id}
                            onClick={() => void syncToZoho(e.id)}
                          >
                            <AppIcon name="sync" size={11} /> {syncingId === e.id ? 'Syncing…' : 'Sync to Zoho'}
                          </button>
                        )}
                      </div>
                    </div>
                    <button type="button" className="assist-mini-btn danger" onClick={() => void remove(e.id)} aria-label="Delete expense">
                      <AppIcon name="close" size={12} />
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
