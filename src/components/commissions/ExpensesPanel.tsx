'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { useCrmData } from '@/components/CrmDataProvider';
import { bmwDealsToCustomers, getBmwAgentRates, resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import { agentForCustomer } from '@/lib/commissions/commission-deal-prefill';
import {
  formatCommissionCurrency,
  formatPeriodLabel,
  periodAfter,
} from '@/lib/commissions/commission-store';
import {
  agentTierOptions,
  effectiveExpenseChargeAmount,
  expenseCustomers,
  expensePartnerSplits,
  periodExpensesComplete,
  submitterLabel,
  reimburseeLabel,
  type CommissionAllocationType,
  type CommissionChargeMode,
  type CommissionExpenseRow,
  type ExpenseCustomerRef,
  type ExpensePartnerRef,
} from '@/lib/commissions/expense-review';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import { setExpensesComplete } from '@/lib/commissions/workflow-status';
import type { Customer } from '@/components/CustomersView';
import type { BmwAgentRate } from '@/lib/bmw/types';

type ExpenseDraft = {
  allocationType: CommissionAllocationType;
  customers: ExpenseCustomerRef[];
  internalSplits: ExpensePartnerRef[];
  commissionAgentId: string;
  reimburseProfileId: string;
  chargeMode: CommissionChargeMode;
  chargeTierRate: number | null;
  chargeAmount: number | null;
  deductionNote: string;
  rejectionNote: string;
  targetPeriod: string;
};

type ReimburseOption = {
  profileId: string;
  displayName: string;
  email: string;
};

function draftFromExpense(e: CommissionExpenseRow, fallbackPeriod: string): ExpenseDraft {
  return {
    allocationType: e.commission_allocation_type ?? 'customer',
    customers: expenseCustomers(e),
    internalSplits: expensePartnerSplits(e),
    commissionAgentId: e.commission_agent_id ?? '',
    reimburseProfileId: e.commission_reimburse_profile_id ?? e.owner_id ?? '',
    chargeMode: e.commission_charge_mode ?? 'full',
    chargeTierRate: e.commission_charge_tier_rate ?? null,
    chargeAmount: e.commission_charge_amount ?? null,
    deductionNote: e.commission_deduction_note ?? '',
    rejectionNote: e.commission_rejection_note ?? '',
    targetPeriod: e.commission_target_period ?? e.commission_period ?? fallbackPeriod,
  };
}

function statusLabel(status: CommissionExpenseRow['commission_review_status']): string {
  if (status === 'included') return 'Included';
  if (status === 'rejected') return 'Rejected';
  if (status === 'deferred') return 'Deferred';
  return 'Pending review';
}

function statusClass(status: CommissionExpenseRow['commission_review_status']): string {
  if (status === 'included') return 'comm-expense-status--included';
  if (status === 'rejected') return 'comm-expense-status--rejected';
  if (status === 'deferred') return 'comm-expense-status--deferred';
  return 'comm-expense-status--pending';
}

function ExpenseReviewRow({
  expense,
  period,
  customers,
  agents,
  teamPartners,
  reimburseOptions,
  onUpdated,
}: {
  expense: CommissionExpenseRow;
  period: string;
  customers: Customer[];
  agents: BmwAgentRate[];
  teamPartners: InternalCommissionParticipant[];
  reimburseOptions: ReimburseOption[];
  onUpdated: (updated?: CommissionExpenseRow) => void;
}) {
  const [draft, setDraft] = useState<ExpenseDraft>(() => draftFromExpense(expense, period));
  const [customerQuery, setCustomerQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [liveExpense, setLiveExpense] = useState(expense);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const seededFromId = useRef(expense.id);

  useEffect(() => {
    setLiveExpense(expense);
  }, [expense]);

  // Only reset local draft when switching to a different expense row — not on parent refetch.
  useEffect(() => {
    if (seededFromId.current === expense.id) return;
    seededFromId.current = expense.id;
    setLiveExpense(expense);
    setDraft(draftFromExpense(expense, period));
    setCustomerQuery('');
    setShowReject(false);
    setIsEditing(false);
    setError('');
  }, [expense, period]);

  const accountMatches = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    const selected = new Set(draft.customers.map((c) => c.id));
    const pool = customers.filter((c) => !selected.has(c.id));
    if (!q) return pool.slice(0, 10);
    return pool
      .filter(
        (c) =>
          c.company.toLowerCase().includes(q)
          || (c.agent ?? '').toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [customers, customerQuery, draft.customers]);

  const tiers = useMemo(
    () => agentTierOptions(draft.commissionAgentId, agents),
    [draft.commissionAgentId, agents],
  );

  const previewCharge = useMemo(() => {
    if (draft.chargeMode === 'tier_percent' && draft.chargeAmount != null) {
      return draft.chargeAmount;
    }
    return Math.abs(Number(expense.amount) || 0);
  }, [draft.chargeMode, draft.chargeAmount, expense.amount]);

  const addCustomer = (c: Customer) => {
    let agentProfile = agentForCustomer(c, agents);
    if (!agentProfile && c.agent) {
      agentProfile = agents.find((a) => a.name === c.agent || a.id === c.agent) ?? null;
    }
    const agentName = agentProfile?.name ?? c.agent ?? '';
    setDraft((d) => {
      if (d.customers.some((x) => x.id === c.id)) return d;
      const nextCustomers = [
        ...d.customers,
        { id: c.id, name: c.company, agent: agentName || undefined },
      ];
      return {
        ...d,
        allocationType: d.allocationType === 'charge_and_reimburse' ? 'charge_and_reimburse' : 'customer',
        customers: nextCustomers,
        commissionAgentId:
          d.allocationType === 'charge_and_reimburse'
            ? d.commissionAgentId
            : d.commissionAgentId || agentProfile?.id || '',
      };
    });
    setCustomerQuery('');
    setShowSuggestions(false);
  };

  const removeCustomer = (id: string) => {
    setDraft((d) => ({
      ...d,
      customers: d.customers.filter((c) => c.id !== id),
    }));
  };

  const selectAllCustomers = () => {
    setDraft((d) => {
      const existing = new Set(d.customers.map((c) => c.id));
      const added: ExpenseCustomerRef[] = [];
      for (const c of customers) {
        if (existing.has(c.id)) continue;
        let agentProfile = agentForCustomer(c, agents);
        if (!agentProfile && c.agent) {
          agentProfile = agents.find((a) => a.name === c.agent || a.id === c.agent) ?? null;
        }
        added.push({
          id: c.id,
          name: c.company,
          agent: agentProfile?.name ?? c.agent ?? undefined,
        });
      }
      return {
        ...d,
        allocationType: d.allocationType === 'charge_and_reimburse' ? 'charge_and_reimburse' : 'customer',
        customers: [...d.customers, ...added],
        commissionAgentId:
          d.allocationType === 'charge_and_reimburse'
            ? d.commissionAgentId
            : d.commissionAgentId
              || (added[0]
                ? agents.find((a) => a.name === added[0]!.agent)?.id ?? d.commissionAgentId
                : d.commissionAgentId),
      };
    });
  };

  const setTierCharge = (tierId: string) => {
    const tier = agents.find((a) => a.id === tierId);
    if (!tier) return;
    const rate = Number(tier.commissionRate) || 0;
    const base = Math.abs(Number(expense.amount) || 0);
    setDraft((d) => ({
      ...d,
      commissionAgentId: tierId,
      chargeMode: 'tier_percent',
      chargeTierRate: rate,
      chargeAmount: Math.round(base * (rate / 100) * 100) / 100,
    }));
  };

  const previewReimbursee = useMemo(() => {
    const selected = reimburseOptions.find((o) => o.profileId === draft.reimburseProfileId);
    if (selected) return selected.displayName || selected.email;
    return reimburseeLabel(liveExpense);
  }, [reimburseOptions, draft.reimburseProfileId, liveExpense]);

  const submitReview = async (decision: 'include' | 'reject' | 'defer') => {
    setBusy(true);
    setError('');
    try {
      const primary = draft.customers[0];
      const res = await fetch('/api/admin/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'review',
          id: expense.id,
          decision,
          commissionPeriod: period,
          targetPeriod: decision === 'defer' ? draft.targetPeriod || null : draft.targetPeriod || period,
          allocationType: draft.allocationType,
          customers: draft.customers,
          customerId: primary?.id ?? null,
          customerName: primary?.name ?? null,
          customerAgent: primary?.agent ?? null,
          commissionAgentId: draft.commissionAgentId || null,
          reimburseProfileId: draft.reimburseProfileId || null,
          chargeMode: draft.chargeMode,
          chargeTierRate: draft.chargeMode === 'tier_percent' ? draft.chargeTierRate : null,
          chargeAmount:
            draft.allocationType === 'internal_reimburse' && draft.chargeMode === 'tier_percent'
              ? draft.chargeAmount
              : draft.chargeMode === 'tier_percent'
                ? draft.chargeAmount
                : Math.abs(Number(expense.amount) || 0),
          internalSplits: draft.internalSplits,
          deductionNote: draft.deductionNote || null,
          rejectionNote: decision === 'reject' ? draft.rejectionNote : null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        expense?: CommissionExpenseRow;
      };
      if (!res.ok) throw new Error(json.error ?? 'Review failed');
      if (json.expense) setLiveExpense(json.expense);
      setIsEditing(false);
      onUpdated(json.expense);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save review.');
    } finally {
      setBusy(false);
    }
  };

  const isResolved =
    liveExpense.commission_review_status === 'included'
    || liveExpense.commission_review_status === 'rejected';
  const isDeferred = liveExpense.commission_review_status === 'deferred';
  const showForm = isEditing || (!isResolved && !isDeferred);
  const equalSplitHint =
    draft.allocationType === 'customer' && draft.customers.length > 1
      ? `${formatCommissionCurrency(Math.abs(Number(expense.amount) || 0) / draft.customers.length)} each across ${draft.customers.length} accounts`
      : null;

  return (
    <div className={`comm-expense-review${isResolved || isDeferred ? ' comm-expense-review--resolved' : ''}`}>
      <div className="comm-expense-review-head">
        <div>
          <div className="comm-expense-review-title">
            {liveExpense.merchant ?? 'Expense'}
            {liveExpense.bank_deposit_import_id != null && (
              <span className="comm-expense-source-badge">Bank deposit</span>
            )}
            {liveExpense.resubmitted_from_id && (
              <span className="comm-expense-source-badge">Resubmitted</span>
            )}
          </div>
          <div className="comm-expense-review-meta">
            {[
              `Submitted by ${submitterLabel(liveExpense)}`,
              liveExpense.spent_on,
              liveExpense.category,
              liveExpense.note,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="comm-expense-review-right">
          <span className={`comm-expense-status ${statusClass(liveExpense.commission_review_status)}`}>
            {statusLabel(liveExpense.commission_review_status)}
          </span>
          <span className="comm-expense-review-amount">
            {formatCommissionCurrency(Number(liveExpense.amount) || 0)}
          </span>
        </div>
      </div>

      {showForm ? (
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
              Customer accounts (equal split · deduct from agent commission)
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
                    customers: [],
                  }))
                }
              />
              Agent fee (charge agent full amount or tier %)
            </label>
            <label className="comm-expense-allocation-opt">
              <input
                type="radio"
                name={`alloc-${expense.id}`}
                checked={draft.allocationType === 'charge_and_reimburse'}
                onChange={() =>
                  setDraft((d) => ({
                    ...d,
                    allocationType: 'charge_and_reimburse',
                    reimburseProfileId: d.reimburseProfileId || expense.owner_id || '',
                    chargeMode: 'full',
                    chargeAmount: Math.abs(Number(expense.amount) || 0),
                  }))
                }
              />
              Charge agent &amp; reimburse payee
            </label>
            <label className="comm-expense-allocation-opt">
              <input
                type="radio"
                name={`alloc-${expense.id}`}
                checked={draft.allocationType === 'internal_reimburse'}
                onChange={() =>
                  setDraft((d) => ({
                    ...d,
                    allocationType: 'internal_reimburse',
                    customers: [],
                    chargeMode: 'full',
                    chargeAmount: Math.abs(Number(expense.amount) || 0),
                  }))
                }
              />
              Reimburse submitter ({submitterLabel(expense)}) from house
            </label>
            <label className="comm-expense-allocation-opt">
              <input
                type="radio"
                name={`alloc-${expense.id}`}
                checked={draft.allocationType === 'internal_partner'}
                onChange={() =>
                  setDraft((d) => ({
                    ...d,
                    allocationType: 'internal_partner',
                    customers: [],
                    internalSplits: teamPartners.map((p) => ({
                      profileId: p.profileId,
                      name: p.displayName,
                      percent: p.defaultHouseSharePercent,
                    })),
                  }))
                }
              />
              Internal partner split (charge partners from house payouts)
            </label>
          </div>

          {draft.allocationType === 'customer' ? (
            <div className="settings-field" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <label className="settings-field-label" style={{ margin: 0 }}>Customers</label>
                <button
                  type="button"
                  className="assist-mini-btn"
                  onClick={selectAllCustomers}
                  disabled={!customers.length}
                >
                  Select all
                </button>
              </div>
              {draft.customers.length > 0 && (
                <div className="expense-account-chip-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {draft.customers.map((c) => (
                    <div key={c.id} className="expense-account-chip">
                      <span className="expense-account-chip-name">
                        <AppIcon name="building" size={12} /> {c.name}
                        {c.agent ? (
                          <span className="expense-account-chip-agent"> · {c.agent}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="expense-account-chip-clear"
                        onClick={() => removeCustomer(c.id)}
                        aria-label={`Remove ${c.name}`}
                      >
                        <AppIcon name="close" size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {equalSplitHint && (
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>{equalSplitHint}</div>
              )}
              <div className="expense-account-search" style={{ marginTop: 8 }}>
                <input
                  className="settings-input"
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder={customers.length ? 'Add accounts…' : 'No accounts loaded'}
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
                        onClick={() => addCustomer(c)}
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
              <div className="settings-field" style={{ marginTop: 12 }}>
                <label className="settings-field-label">Pay from agent</label>
                <select
                  className="settings-input"
                  value={draft.commissionAgentId}
                  onChange={(e) => setDraft((d) => ({ ...d, commissionAgentId: e.target.value }))}
                >
                  <option value="">Select agent…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.commissionRate}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : draft.allocationType === 'agent_fee' ? (
            <div className="settings-invite-grid" style={{ marginTop: 12 }}>
              <div className="settings-field">
                <label className="settings-field-label">Agent</label>
                <select
                  className="settings-input"
                  value={draft.commissionAgentId}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      commissionAgentId: e.target.value,
                      chargeMode: 'full',
                      chargeTierRate: null,
                      chargeAmount: Math.abs(Number(expense.amount) || 0),
                    }))
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
              <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                <label className="settings-field-label">Charge amount</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="comm-expense-allocation-opt">
                    <input
                      type="radio"
                      name={`charge-${expense.id}`}
                      checked={draft.chargeMode === 'full'}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          chargeMode: 'full',
                          chargeTierRate: null,
                          chargeAmount: Math.abs(Number(expense.amount) || 0),
                        }))
                      }
                    />
                    Full expense ({formatCommissionCurrency(Math.abs(Number(expense.amount) || 0))})
                  </label>
                  <label className="comm-expense-allocation-opt">
                    <input
                      type="radio"
                      name={`charge-${expense.id}`}
                      checked={draft.chargeMode === 'tier_percent'}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          chargeMode: 'tier_percent',
                        }))
                      }
                      disabled={!draft.commissionAgentId}
                    />
                    Based on commission tier %
                  </label>
                  {draft.chargeMode === 'tier_percent' && (
                    <select
                      className="settings-input"
                      value={
                        tiers.find((t) => t.commissionRate === draft.chargeTierRate)?.id
                        ?? draft.commissionAgentId
                      }
                      onChange={(e) => setTierCharge(e.target.value)}
                    >
                      <option value="">Select tier…</option>
                      {tiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.commissionRate}% →{' '}
                          {formatCommissionCurrency(
                            Math.round(Math.abs(Number(expense.amount) || 0) * (t.commissionRate / 100) * 100) /
                              100,
                          )}
                        </option>
                      ))}
                    </select>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                    Will deduct {formatCommissionCurrency(previewCharge)} from agent payout
                  </div>
                </div>
              </div>
            </div>
          ) : draft.allocationType === 'charge_and_reimburse' ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 8 }}>
                Charges the selected agent on <strong>Agent payments</strong> and reimburses{' '}
                <strong>{previewReimbursee}</strong> on <strong>Team payouts</strong> for{' '}
                {formatCommissionCurrency(Math.abs(Number(expense.amount) || 0))}.
                {draft.reimburseProfileId && draft.reimburseProfileId !== expense.owner_id ? (
                  <>
                    {' '}
                    (Submitted by {submitterLabel(expense)} on their behalf.)
                  </>
                ) : null}
              </div>
              <div className="settings-field">
                <label className="settings-field-label">Reimburse to</label>
                <select
                  className="settings-input"
                  value={draft.reimburseProfileId}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      reimburseProfileId: e.target.value,
                    }))
                  }
                >
                  <option value="">Select person…</option>
                  {reimburseOptions.map((person) => (
                    <option key={person.profileId} value={person.profileId}>
                      {person.displayName}
                      {person.email ? ` (${person.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-field" style={{ marginTop: 12 }}>
                <label className="settings-field-label">Agent to charge</label>
                <select
                  className="settings-input"
                  value={draft.commissionAgentId}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      commissionAgentId: e.target.value,
                      chargeMode: 'full',
                      chargeAmount: Math.abs(Number(expense.amount) || 0),
                    }))
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
              <div className="settings-field" style={{ marginTop: 12 }}>
                <label className="settings-field-label">Related customer (optional)</label>
                <div className="expense-account-chip-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {draft.customers.map((c) => (
                    <div key={c.id} className="expense-account-chip">
                      <span className="expense-account-chip-name">{c.name}</span>
                      <button
                        type="button"
                        className="expense-account-chip-clear"
                        onClick={() => removeCustomer(c.id)}
                        aria-label={`Remove ${c.name}`}
                      >
                        <AppIcon name="close" size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="expense-account-search" style={{ marginTop: 8 }}>
                  <input
                    className="settings-input"
                    placeholder="Search customer…"
                    value={customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                  />
                  {showSuggestions && accountMatches.length > 0 && (
                    <div className="expense-account-suggestions" role="listbox">
                      {accountMatches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="expense-account-suggestion"
                          onClick={() => addCustomer(c)}
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
              </div>
            </div>
          ) : draft.allocationType === 'internal_reimburse' ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 8 }}>
                Adds to <strong>{submitterLabel(expense)}</strong>&apos;s team payout for this period
                (e.g. Zoho subscription they paid personally).
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className="comm-expense-allocation-opt">
                  <input
                    type="radio"
                    name={`reimburse-${expense.id}`}
                    checked={draft.chargeMode === 'full'}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        chargeMode: 'full',
                        chargeAmount: Math.abs(Number(expense.amount) || 0),
                      }))
                    }
                  />
                  Full reimbursement ({formatCommissionCurrency(Math.abs(Number(expense.amount) || 0))})
                </label>
                <label className="comm-expense-allocation-opt">
                  <input
                    type="radio"
                    name={`reimburse-${expense.id}`}
                    checked={draft.chargeMode === 'tier_percent'}
                    onChange={() => setDraft((d) => ({ ...d, chargeMode: 'tier_percent' }))}
                  />
                  Partial amount
                </label>
                {draft.chargeMode === 'tier_percent' && (
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="settings-input"
                    style={{ maxWidth: 160 }}
                    value={draft.chargeAmount ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        chargeAmount: Number(e.target.value) || 0,
                      }))
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 8 }}>
                Deducts from each partner&apos;s house payout by share % (e.g. shared software).
              </div>
              {teamPartners.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                  Add partners under Agents &amp; Team → Internal team first.
                </div>
              ) : (
                teamPartners.map((p) => {
                  const current =
                    draft.internalSplits.find((s) => s.profileId === p.profileId)?.percent ?? 0;
                  return (
                    <label
                      key={p.profileId}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}
                    >
                      <span style={{ minWidth: 140 }}>{p.displayName}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        className="settings-input"
                        style={{ width: 90 }}
                        value={current}
                        onChange={(e) => {
                          const percent = Number(e.target.value) || 0;
                          setDraft((prev) => {
                            const others = prev.internalSplits.filter((s) => s.profileId !== p.profileId);
                            return {
                              ...prev,
                              internalSplits: [
                                ...others,
                                { profileId: p.profileId, name: p.displayName, percent },
                              ],
                            };
                          });
                        }}
                      />
                      <span>%</span>
                    </label>
                  );
                })
              )}
            </div>
          )}

          <div className="settings-field" style={{ marginTop: 12 }}>
            <label className="settings-field-label">Apply to period</label>
            <select
              className="settings-input"
              value={draft.targetPeriod}
              onChange={(e) => setDraft((d) => ({ ...d, targetPeriod: e.target.value }))}
            >
              <option value={period}>This month ({formatPeriodLabel(period)})</option>
              <option value={periodAfter(period)}>
                Next month ({formatPeriodLabel(periodAfter(period))})
              </option>
              <option value="">Leave / auto-roll (appear next time until decided)</option>
            </select>
          </div>

          {showReject ? (
            <div className="comm-expense-reject-box">
              <label className="settings-field-label">Rejection reason (required)</label>
              <textarea
                className="settings-input"
                rows={2}
                value={draft.rejectionNote}
                onChange={(e) => setDraft((d) => ({ ...d, rejectionNote: e.target.value }))}
                placeholder="Explain so the submitter can fix and resubmit…"
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
                {liveExpense.commission_review_status === 'included' ? 'Save changes' : 'Include'}
              </button>
              {liveExpense.commission_review_status === 'included' && (
                <button
                  type="button"
                  className="admin-ticket-btn"
                  disabled={busy}
                  onClick={() => {
                    setIsEditing(false);
                    setDraft(draftFromExpense(liveExpense, period));
                    setError('');
                  }}
                >
                  Cancel
                </button>
              )}
              {(liveExpense.commission_review_status !== 'included' || isEditing) && (
              <>
              <button
                type="button"
                className="admin-ticket-btn"
                disabled={busy}
                onClick={() => void submitReview('defer')}
              >
                Defer / roll
              </button>
              <button
                type="button"
                className="admin-ticket-btn"
                disabled={busy}
                onClick={() => setShowReject(true)}
              >
                Reject
              </button>
              </>
              )}
            </div>
          )}

          {error && <div className="settings-form-error">{error}</div>}
        </>
      ) : (
        <div className="comm-expense-review-summary">
          {liveExpense.commission_review_status === 'included' && (
            <>
              {liveExpense.commission_allocation_type === 'customer' ? (
                <span>
                  Deduct from{' '}
                  <strong>
                    {expenseCustomers(liveExpense)
                      .map((c) => c.name)
                      .filter(Boolean)
                      .join(', ') || 'accounts'}
                  </strong>
                  {liveExpense.commission_agent_id ? (
                    <> ({resolveAgentDisplayName(liveExpense.commission_agent_id)})</>
                  ) : null}
                  {' · '}
                  charge {formatCommissionCurrency(effectiveExpenseChargeAmount(liveExpense))}
                </span>
              ) : liveExpense.commission_allocation_type === 'charge_and_reimburse' ? (
                <span>
                  Charge <strong>{resolveAgentDisplayName(liveExpense.commission_agent_id ?? '')}</strong>
                  {' · '}
                  reimburse <strong>{reimburseeLabel(liveExpense)}</strong>
                  {' · '}
                  {formatCommissionCurrency(effectiveExpenseChargeAmount(liveExpense))}
                </span>
              ) : liveExpense.commission_allocation_type === 'internal_reimburse' ? (
                <span>
                  Reimburse <strong>{submitterLabel(liveExpense)}</strong>
                  {' · '}
                  {formatCommissionCurrency(effectiveExpenseChargeAmount(liveExpense))}
                  {liveExpense.commission_charge_mode === 'tier_percent' ? ' (partial)' : ''}
                </span>
              ) : liveExpense.commission_allocation_type === 'internal_partner' ? (
                <span>
                  Partner split —{' '}
                  <strong>
                    {expensePartnerSplits(liveExpense)
                      .map((s) => {
                        const name =
                          teamPartners.find((p) => p.profileId === s.profileId)?.displayName
                          ?? s.name
                          ?? 'Partner';
                        return `${name} ${s.percent}%`;
                      })
                      .join(' · ')}
                  </strong>
                  {' · '}
                  {formatCommissionCurrency(effectiveExpenseChargeAmount(liveExpense))}
                </span>
              ) : (
                <span>
                  Agent fee —{' '}
                  <strong>
                    {liveExpense.commission_agent_id
                      ? resolveAgentDisplayName(liveExpense.commission_agent_id)
                      : 'Agent'}
                  </strong>
                  {liveExpense.commission_charge_mode === 'tier_percent'
                    ? ` · ${liveExpense.commission_charge_tier_rate}% tier = ${formatCommissionCurrency(effectiveExpenseChargeAmount(liveExpense))}`
                    : ` · ${formatCommissionCurrency(effectiveExpenseChargeAmount(liveExpense))}`}
                  {liveExpense.commission_deduction_note ? `: ${liveExpense.commission_deduction_note}` : null}
                </span>
              )}
            </>
          )}
          {liveExpense.commission_review_status === 'rejected' && (
            <span>Rejected: {liveExpense.commission_rejection_note}</span>
          )}
          {isDeferred && (
            <span>
              Deferred
              {liveExpense.commission_target_period
                ? ` → ${formatPeriodLabel(liveExpense.commission_target_period)}`
                : ' (rolls to next month until included or rejected)'}
            </span>
          )}
          {(liveExpense.commission_review_status === 'included' || isDeferred) && (
            <div className="comm-expense-review-actions" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => {
                  setDraft(draftFromExpense(liveExpense, period));
                  setIsEditing(true);
                }}
              >
                Edit allocation
              </button>
            </div>
          )}
        </div>
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
  const [teamPartners, setTeamPartners] = useState<InternalCommissionParticipant[]>([]);
  const [reimburseOptions, setReimburseOptions] = useState<ReimburseOption[]>([]);

  useEffect(() => {
    void fetch('/api/admin/team-participants', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { participants: [], roster: [] }))
      .then((json: {
        participants?: InternalCommissionParticipant[];
        roster?: Array<{ id: string; displayName: string; email: string }>;
      }) => {
        setTeamPartners(
          (json.participants ?? []).filter(
            (p) => p.status === 'active' && p.participantType === 'partner',
          ),
        );
        const byId = new Map<string, ReimburseOption>();
        for (const member of json.roster ?? []) {
          byId.set(member.id, {
            profileId: member.id,
            displayName: member.displayName,
            email: member.email,
          });
        }
        for (const participant of json.participants ?? []) {
          byId.set(participant.profileId, {
            profileId: participant.profileId,
            displayName: participant.displayName,
            email: participant.email,
          });
        }
        setReimburseOptions(
          [...byId.values()].sort((a, b) =>
            a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
          ),
        );
      })
      .catch(() => {
        setTeamPartners([]);
        setReimburseOptions([]);
      });
  }, []);

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

  const loadExpenses = useCallback(async (opts?: { background?: boolean }) => {
    const background = opts?.background ?? false;
    if (!background) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/expenses?period=${encodeURIComponent(period)}&latestPeriod=${encodeURIComponent(latestPeriod)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        if (!background) setExpenses([]);
        return;
      }
      const json = (await res.json()) as { expenses?: CommissionExpenseRow[] };
      const rows = json.expenses ?? [];
      setExpenses(rows);
      setExpensesComplete(period, periodExpensesComplete(rows));
    } catch {
      if (!background) setExpenses([]);
    } finally {
      if (!background) setLoading(false);
    }
  }, [period, latestPeriod]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  // Background refresh when another view logs or resubmits an expense.
  useEffect(() => {
    const onExpenseUpdate = () => void loadExpenses({ background: true });
    window.addEventListener('candid-expenses-updated', onExpenseUpdate);
    return () => window.removeEventListener('candid-expenses-updated', onExpenseUpdate);
  }, [loadExpenses]);

  const applyExpenseUpdate = useCallback(
    (updated: CommissionExpenseRow) => {
      setExpenses((prev) => {
        const next = prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e));
        const visible = next.filter((e) => {
          if (e.commission_review_status === 'rejected') return false;
          if (
            e.commission_review_status === 'deferred'
            && e.commission_target_period
            && e.commission_target_period !== period
          ) {
            return false;
          }
          return true;
        });
        setExpensesComplete(period, periodExpensesComplete(visible));
        return visible;
      });
    },
    [period],
  );

  const onUpdated = useCallback(
    (updated?: CommissionExpenseRow) => {
      if (updated) {
        applyExpenseUpdate(updated);
        window.dispatchEvent(new Event('candid-commissions-updated'));
        return;
      }
      void loadExpenses({ background: true });
      window.dispatchEvent(new Event('candid-expenses-updated'));
      window.dispatchEvent(new Event('candid-commissions-updated'));
    },
    [applyExpenseUpdate, loadExpenses],
  );

  const complete = periodExpensesComplete(expenses);
  const pendingCount = expenses.filter(
    (e) => e.commission_review_status === 'pending',
  ).length;
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
            Review expenses submitted by the team. Assign to one or more customer accounts (equal
            split), or charge an agent the full amount / a commission-tier %. Reject with a reason to
            send back to My Expenses for resubmit. Defer to roll into another month.
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
                  teamPartners={teamPartners}
                  reimburseOptions={reimburseOptions}
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
