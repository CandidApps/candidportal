'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  formatCommissionCurrency,
  formatPeriodLabel,
  type SupplierImportBatch,
} from '@/lib/commissions/commission-store';
import {
  attachTeamPayoutPaidState,
  setAllTeamMembersPaid,
  setTeamMemberPaid,
  type TeamPayoutRowView,
} from '@/lib/commissions/team-payout-store';
import { applyExpenseAdjustmentsToTeamRows, type CommissionExpenseRow } from '@/lib/commissions/expense-review';
import {
  applyReconciliationToTeamRows,
  type SupplierPeriodAdjustment,
} from '@/lib/commissions/supplier-reconciliation';
import { buildTeamPayoutRows } from '@/lib/team/internal-commission-engine';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import type { AgentSourcingRule } from '@/lib/services/internal-agent-sourcing-db';

const Chevron = ({ open }: { open: boolean }) => (
  <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
    ›
  </span>
);

const StatCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  accent?: string;
}> = ({ label, value, sub, accent }) => (
  <div className="comm-stat-card" style={accent ? { borderLeftColor: accent } : undefined}>
    <div className="comm-stat-label" style={accent ? { color: accent } : undefined}>{label}</div>
    <div className="comm-stat-value">{value}</div>
    <div className="comm-stat-sub">{sub}</div>
  </div>
);

export default function TeamPayoutsPanel({
  period,
  latestPeriod,
  imports,
  participants,
  sourcingRules = [],
  adjustments = [],
  loading = false,
  onRefresh,
}: {
  period: string;
  latestPeriod: string;
  imports: SupplierImportBatch[];
  participants: InternalCommissionParticipant[];
  sourcingRules?: AgentSourcingRule[];
  adjustments?: SupplierPeriodAdjustment[];
  loading?: boolean;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodExpenses, setPeriodExpenses] = useState<CommissionExpenseRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/expenses?period=${encodeURIComponent(period)}&latestPeriod=${encodeURIComponent(latestPeriod)}`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { expenses?: CommissionExpenseRow[] };
        if (!cancelled) setPeriodExpenses(json.expenses ?? []);
      } catch {
        if (!cancelled) setPeriodExpenses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period, latestPeriod]);

  const rows = useMemo(() => {
    const base = buildTeamPayoutRows(imports, period, participants, sourcingRules);
    const afterExpenses = applyExpenseAdjustmentsToTeamRows(base, periodExpenses);
    const afterReconciliation = applyReconciliationToTeamRows(
      afterExpenses,
      adjustments,
      period,
      participants,
    );
    return attachTeamPayoutPaidState(afterReconciliation, period);
  }, [imports, period, participants, sourcingRules, periodExpenses, adjustments]);

  const unpaidIds = useMemo(
    () => rows.filter((r) => !r.paid && r.currentMonthOwed > 0).map((r) => r.profileId),
    [rows],
  );

  const allSelected = unpaidIds.length > 0 && unpaidIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(unpaidIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markPaid = (ids: string[]) => {
    setAllTeamMembersPaid(ids, true, period);
    setSelected(new Set());
    onRefresh();
  };

  const totals = useMemo(
    () => ({
      owed: rows.reduce((s, r) => s + (r.paid ? 0 : r.currentMonthOwed), 0),
      ytd: rows.reduce((s, r) => s + r.ytdPaid, 0),
      lastPaid: rows.reduce((s, r) => s + r.lastMonthPaid, 0),
    }),
    [rows],
  );

  if (!participants.filter((p) => p.status === 'active' && p.participantType !== 'inactive').length) {
    return (
      <div className="card">
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0 }}>
            No internal team members are configured for commission splits. Go to{' '}
            <strong>Agents &amp; Team → Internal team</strong> to add partners and set house-share
            percentages (e.g. 60% / 40%).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="comm-stat-grid">
        <StatCard
          label="Owed this month"
          value={formatCommissionCurrency(totals.owed)}
          sub={formatPeriodLabel(period)}
          accent="var(--red)"
        />
        <StatCard
          label="Paid last month"
          value={formatCommissionCurrency(totals.lastPaid)}
          sub="All team members"
          accent="var(--green)"
        />
        <StatCard
          label="Year to date"
          value={formatCommissionCurrency(totals.ytd)}
          sub="House share accrued"
          accent="var(--blue)"
        />
        <StatCard
          label="Unpaid"
          value={String(unpaidIds.length)}
          sub="Awaiting payout"
          accent="var(--amber)"
        />
      </div>

      <div className="comm-bulk-bar">
        <label className="comm-check-label">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!unpaidIds.length} />
          Select all unpaid
        </label>
        <button
          type="button"
          className="admin-ticket-btn primary"
          disabled={!selected.size}
          onClick={() => markPaid([...selected])}
        >
          Mark selected paid
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', padding: '8px 0 16px' }}>
          Loading commission data…
        </p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', padding: '8px 0 16px' }}>
          No house-net commission for {formatPeriodLabel(period)}. Team payouts appear after
          supplier imports and external agent allocations leave a house remainder.
        </p>
      ) : null}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Team payouts — {formatPeriodLabel(period)}</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-mini-table comm-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th style={{ width: 36 }} />
                <th>Team member</th>
                <th>Role</th>
                <th style={{ textAlign: 'right' }}>Current month owed</th>
                <th style={{ textAlign: 'right' }}>Last month</th>
                <th style={{ textAlign: 'right' }}>YTD</th>
                <th style={{ textAlign: 'right', width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TeamRow
                  key={row.profileId}
                  row={row}
                  expanded={expandedId === row.profileId}
                  onToggle={() => setExpandedId(expandedId === row.profileId ? null : row.profileId)}
                  canSelect={!row.paid && row.currentMonthOwed > 0}
                  selected={selected.has(row.profileId)}
                  onSelectToggle={() => toggleOne(row.profileId)}
                  onMarkPaid={() => {
                    setTeamMemberPaid(row.profileId, true, period, row.currentMonthOwed);
                    onRefresh();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TeamRow({
  row,
  expanded,
  onToggle,
  canSelect,
  selected,
  onSelectToggle,
  onMarkPaid,
}: {
  row: TeamPayoutRowView;
  expanded: boolean;
  onToggle: () => void;
  canSelect: boolean;
  selected: boolean;
  onSelectToggle: () => void;
  onMarkPaid: () => void;
}) {
  const roleLabel =
    row.participantType === 'internal_employee' ? 'Employee' : 'Partner';

  return (
    <Fragment>
      <tr className="comm-row-clickable">
        <td onClick={(e) => e.stopPropagation()}>
          {canSelect && (
            <input type="checkbox" checked={selected} onChange={onSelectToggle} />
          )}
        </td>
        <td onClick={onToggle}>
          <Chevron open={expanded} />
        </td>
        <td onClick={onToggle}>
          <div style={{ fontWeight: 600 }}>{row.displayName}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)' }}>{row.email}</div>
        </td>
        <td onClick={onToggle} style={{ fontSize: 12 }}>
          {roleLabel}
        </td>
        <td
          style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
          onClick={onToggle}
        >
          {row.paid ? (
            <span className="admin-status-pill admin-status-pill--resolved">Paid</span>
          ) : (
            formatCommissionCurrency(row.currentMonthOwed)
          )}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }} onClick={onToggle}>
          {formatCommissionCurrency(row.lastMonthPaid)}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }} onClick={onToggle}>
          {formatCommissionCurrency(row.ytdPaid)}
        </td>
        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
          {!row.paid && row.currentMonthOwed > 0 && (
            <button type="button" className="admin-ticket-btn primary" style={{ fontSize: 11 }} onClick={onMarkPaid}>
              Mark paid
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: 'var(--gray-light)' }}>
            <div style={{ padding: '12px 16px 16px 52px' }}>
              {row.deals.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--gray)', margin: 0 }}>No attributed deals this period.</p>
              ) : (
                <table className="admin-mini-table comm-table" style={{ background: 'var(--white)' }}>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Supplier</th>
                      <th>External agent</th>
                      <th style={{ textAlign: 'right' }}>House net</th>
                      <th style={{ textAlign: 'right' }}>Share</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.deals.map((d) => (
                      <tr key={`${d.dealUid}-${d.supplier}`}>
                        <td>{d.company}</td>
                        <td>{d.supplier}</td>
                        <td style={{ fontSize: 12, color: 'var(--gray)' }}>{d.primaryAgentName}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {formatCommissionCurrency(d.houseNet)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {d.sharePercent.toFixed(1)}%
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {formatCommissionCurrency(d.amount)}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--gray)' }}>{d.ruleLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
