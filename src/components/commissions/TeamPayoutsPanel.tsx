'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { buildHouseDealSummaries, buildTeamPayoutRows, teamPayoutAmountBreakdown } from '@/lib/team/internal-commission-engine';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import type { InternalDealSplit } from '@/lib/services/internal-deal-splits-db';
import {
  buildTeamSplitLedger,
  initialsForName,
  TEAM_PAYOUT_COLORS,
  teamPayoutRoleSubtitle,
  type TeamLedgerAdjustmentEntry,
  type TeamSplitLedgerDeal,
  type TeamSplitRecipient,
} from '@/lib/team/team-payout-ledger';
import { ModifyTeamSplitModal } from '@/components/commissions/ModifyTeamSplitModal';

function SplitBar({ percents, recipients }: { percents: number[]; recipients: TeamSplitRecipient[] }) {
  const total = percents.reduce((s, p) => s + p, 0) || 1;
  const segments =
    percents.length > 0
      ? percents.map((pct, i) => ({
          pct,
          color: recipients[i]?.color ?? TEAM_PAYOUT_COLORS[i % TEAM_PAYOUT_COLORS.length]!,
        }))
      : recipients.map((r) => ({
          pct: Math.max(0, r.sharePercent),
          color: r.color,
        }));

  return (
    <div className="comm-team-split-bar-wrap">
      <div className="comm-team-split-bar">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="comm-team-split-bar-seg"
            style={{ width: `${(seg.pct / total) * 100}%`, background: seg.color }}
          />
        ))}
      </div>
      <span className="comm-team-split-label">
        {percents.length ? percents.join('/') : segments.map((s) => Math.round(s.pct)).join('/')}
      </span>
    </div>
  );
}

function RecipientsList({ recipients }: { recipients: TeamSplitRecipient[] }) {
  return (
    <div className="comm-team-recipients">
      {recipients.map((r) => (
        <span key={r.profileId} className="comm-team-recipient">
          <span className="comm-team-recipient-dot" style={{ background: r.color }} />
          <span>
            {r.displayName}{' '}
            <span className="comm-team-recipient-amt" style={{ color: r.color }}>
              {formatCommissionCurrency(r.amount)}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

function LedgerDealRow({
  deal,
  onModify,
}: {
  deal: TeamSplitLedgerDeal;
  onModify?: (deal: TeamSplitLedgerDeal) => void;
}) {
  const kindClass =
    deal.kind === 'expense'
      ? 'comm-team-ledger-deal--expense'
      : deal.kind === 'reconciliation'
        ? 'comm-team-ledger-deal--reconciliation'
        : '';

  return (
    <details className={`comm-team-ledger-deal ${kindClass}`.trim()}>
      <summary>
        <span />
        <span className="comm-team-ledger-chev">▶</span>
        <div>
          <div className="comm-team-ledger-deal-name">{deal.company}</div>
          {deal.serviceTitle ? (
            <div className="comm-team-ledger-deal-sub">{deal.serviceTitle}</div>
          ) : deal.kind !== 'commission' ? (
            <div className="comm-team-ledger-deal-sub">{deal.splitReason}</div>
          ) : null}
        </div>
        <div
          className={`comm-team-ledger-agent${deal.agentRatePercent == null ? ' comm-team-ledger-agent--direct' : ''}`}
        >
          {deal.agentRatePercent != null && deal.primaryAgentName
            ? `${deal.primaryAgentName} · ${deal.agentRatePercent.toFixed(0)}%`
            : '— Direct —'}
        </div>
        <div className="comm-team-ledger-num">{formatCommissionCurrency(deal.gross)}</div>
        <div className="comm-team-ledger-num">{formatCommissionCurrency(deal.houseNet)}</div>
        {deal.recipients.length > 0 && deal.splitPercents.length > 0 ? (
          <SplitBar percents={deal.splitPercents} recipients={deal.recipients} />
        ) : (
          <span className="comm-team-split-label">—</span>
        )}
        <RecipientsList recipients={deal.recipients} />
      </summary>
      <div className="comm-team-ledger-detail">
        <div className="comm-team-ledger-reason">
          <div className="comm-team-ledger-reason-head">
            <div>
              <span className="comm-team-ledger-reason-label">Split reason — </span>
              {deal.hasDealOverride ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', marginRight: 6 }}>
                  Custom deal split
                </span>
              ) : null}
              {deal.splitReason}
            </div>
            {deal.kind === 'commission' && onModify ? (
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onModify(deal);
                }}
              >
                Modify
              </button>
            ) : null}
          </div>
          {deal.recipients.length > 1 && (
            <div className="comm-team-ledger-reason-breakdown">
              {deal.recipients.map((r) => (
                <div key={r.profileId} className="comm-team-recipient">
                  <span className="comm-team-recipient-dot" style={{ background: r.color, width: 9, height: 9 }} />
                  <span style={{ fontWeight: 600 }}>
                    {r.displayName} —{' '}
                    <span className="comm-team-recipient-amt">{formatCommissionCurrency(r.amount)}</span>
                    {deal.kind === 'commission' ? ` (${r.sharePercent.toFixed(0)}%)` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

export default function TeamPayoutsPanel({
  period,
  latestPeriod,
  imports,
  participants,
  dealSplitOverrides = [],
  adjustments = [],
  loading = false,
  onRefresh,
}: {
  period: string;
  latestPeriod: string;
  imports: SupplierImportBatch[];
  participants: InternalCommissionParticipant[];
  dealSplitOverrides?: InternalDealSplit[];
  adjustments?: SupplierPeriodAdjustment[];
  loading?: boolean;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodExpenses, setPeriodExpenses] = useState<CommissionExpenseRow[]>([]);
  const [modifyDeal, setModifyDeal] = useState<TeamSplitLedgerDeal | null>(null);
  const [agentLifecycleRevision, setAgentLifecycleRevision] = useState(0);

  useEffect(() => {
    const bump = () => setAgentLifecycleRevision((n) => n + 1);
    window.addEventListener('candid-agents-updated', bump);
    window.addEventListener('candid-commissions-updated', bump);
    return () => {
      window.removeEventListener('candid-agents-updated', bump);
      window.removeEventListener('candid-commissions-updated', bump);
    };
  }, []);

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
    void agentLifecycleRevision;
    const base = buildTeamPayoutRows(imports, period, participants, dealSplitOverrides);
    const afterExpenses = applyExpenseAdjustmentsToTeamRows(base, periodExpenses);
    const afterReconciliation = applyReconciliationToTeamRows(
      afterExpenses,
      adjustments,
      period,
      participants,
    );
    return attachTeamPayoutPaidState(afterReconciliation, period);
  }, [
    imports,
    period,
    participants,
    dealSplitOverrides,
    periodExpenses,
    adjustments,
    agentLifecycleRevision,
  ]);

  const adjustmentEntries = useMemo((): TeamLedgerAdjustmentEntry[] => {
    const out: TeamLedgerAdjustmentEntry[] = [];
    for (const row of rows) {
      for (const line of row.deals) {
        if (
          line.dealUid.startsWith('expense-') ||
          line.supplier === 'Expense' ||
          line.dealUid.includes('reconciliation')
        ) {
          out.push({
            line,
            profileId: row.profileId,
            displayName: row.displayName,
            participantType: row.participantType,
          });
        }
      }
    }
    return out;
  }, [rows]);

  const ledger = useMemo(() => {
    void agentLifecycleRevision;
    return buildTeamSplitLedger(imports, period, participants, dealSplitOverrides, adjustmentEntries);
  }, [imports, period, participants, dealSplitOverrides, adjustmentEntries, agentLifecycleRevision]);

  const houseDeals = useMemo(() => buildHouseDealSummaries(imports, period), [imports, period]);

  const kpis = useMemo(() => {
    const netToSplit = houseDeals.reduce((s, d) => s + d.houseNet, 0);
    const partnerRows = rows.filter((r) => r.participantType === 'partner');
    const sortedPartners = [...partnerRows].sort((a, b) => b.currentMonthOwed - a.currentMonthOwed);
    const primary = sortedPartners[0];
    const secondary = sortedPartners[1];
    const supplierCount = new Set(houseDeals.map((d) => d.supplier)).size;

    return {
      netToSplit,
      primaryShare: primary?.currentMonthOwed ?? 0,
      primaryLabel: primary?.displayName ?? 'Partner share',
      primaryPct: netToSplit > 0 && primary ? (primary.currentMonthOwed / netToSplit) * 100 : 0,
      secondaryShare: secondary?.currentMonthOwed ?? 0,
      secondaryLabel: secondary?.displayName ?? 'Second partner',
      secondaryPct: netToSplit > 0 && secondary ? (secondary.currentMonthOwed / netToSplit) * 100 : 0,
      dealCount: houseDeals.length,
      supplierCount,
    };
  }, [houseDeals, rows]);

  const unpaidIds = useMemo(
    () => rows.filter((r) => !r.paid && r.currentMonthOwed > 0).map((r) => r.profileId),
    [rows],
  );

  const allSelected = unpaidIds.length > 0 && unpaidIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(unpaidIds));
  };

  const markPaid = (ids: string[]) => {
    setAllTeamMembersPaid(ids, true, period);
    setSelected(new Set());
    onRefresh();
  };

  const activeParticipants = participants.filter(
    (p) => p.status === 'active' && p.participantType !== 'inactive',
  );

  if (!activeParticipants.length) {
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
      <div className="comm-team-kpi-grid">
        <div className="comm-team-kpi-card comm-team-kpi-card--red">
          <div className="comm-team-kpi-label">Net to split</div>
          <div className="comm-team-kpi-value">{formatCommissionCurrency(kpis.netToSplit)}</div>
          <div className="comm-team-kpi-sub">{formatPeriodLabel(period)}</div>
        </div>
        <div className="comm-team-kpi-card comm-team-kpi-card--green">
          <div className="comm-team-kpi-label">{kpis.primaryLabel}&apos;s share</div>
          <div className="comm-team-kpi-value">{formatCommissionCurrency(kpis.primaryShare)}</div>
          <div className="comm-team-kpi-sub">
            {kpis.primaryPct > 0 ? `${kpis.primaryPct.toFixed(1)}% of net to split` : 'No partner activity'}
          </div>
        </div>
        <div className="comm-team-kpi-card comm-team-kpi-card--blue">
          <div className="comm-team-kpi-label">{kpis.secondaryLabel}&apos;s share</div>
          <div className="comm-team-kpi-value">{formatCommissionCurrency(kpis.secondaryShare)}</div>
          <div className="comm-team-kpi-sub">
            {kpis.secondaryPct > 0 ? `${kpis.secondaryPct.toFixed(1)}% of net to split` : '—'}
          </div>
        </div>
        <div className="comm-team-kpi-card comm-team-kpi-card--amber">
          <div className="comm-team-kpi-label">Deals this month</div>
          <div className="comm-team-kpi-value">{String(kpis.dealCount)}</div>
          <div className="comm-team-kpi-sub">
            Across {kpis.supplierCount} commission {kpis.supplierCount === 1 ? 'vendor' : 'vendors'}
          </div>
        </div>
      </div>

      {unpaidIds.length > 0 && (
        <div className="comm-bulk-bar">
          <label className="comm-check-label">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
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
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', padding: '8px 0 16px' }}>
          Loading commission data…
        </p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', padding: '8px 0 16px' }}>
          No house-net commission for {formatPeriodLabel(period)}. Team payouts appear after
          supplier imports and external agent allocations leave a house remainder.
        </p>
      ) : (
        <div className="comm-team-payout-grid">
          {rows.map((row, index) => (
            <TeamMemberCard
              key={row.profileId}
              row={row}
              participants={participants}
              color={TEAM_PAYOUT_COLORS[index % TEAM_PAYOUT_COLORS.length]!}
              canSelect={!row.paid && row.currentMonthOwed > 0}
              selected={selected.has(row.profileId)}
              onSelectToggle={() => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(row.profileId)) next.delete(row.profileId);
                  else next.add(row.profileId);
                  return next;
                });
              }}
              onMarkPaid={() => {
                setTeamMemberPaid(row.profileId, true, period, row.currentMonthOwed);
                onRefresh();
              }}
            />
          ))}
        </div>
      )}

      {ledger.length > 0 && (
        <div className="comm-team-ledger">
          <div className="comm-team-ledger-head">
            <div className="comm-team-ledger-title">Split ledger — {formatPeriodLabel(period)}</div>
          </div>
          <div className="comm-team-ledger-scroll">
            <div className="comm-team-ledger-inner">
              <div className="comm-team-ledger-columns">
                <div />
                <div />
                <div>Deal</div>
                <div>Agent (rate)</div>
                <div>Gross</div>
                <div>Net to split</div>
                <div>Split</div>
                <div>Recipients</div>
              </div>

              {ledger.map((group) => (
                <div key={group.supplier}>
                  <div className="comm-team-vendor-header">
                    <div>
                      <span className="comm-team-vendor-name">{group.supplier}</span>
                      <span className="comm-team-vendor-meta">
                        · {group.dealCount} {group.dealCount === 1 ? 'deal' : 'deals'}
                      </span>
                    </div>
                    <div className="comm-team-vendor-totals">
                      Gross {formatCommissionCurrency(group.grossTotal)} · Net to split{' '}
                      {formatCommissionCurrency(group.houseNetTotal)}
                    </div>
                  </div>
                  {group.deals.map((deal) => (
                    <LedgerDealRow
                      key={deal.key}
                      deal={deal}
                      onModify={deal.kind === 'commission' ? setModifyDeal : undefined}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {modifyDeal && (
        <ModifyTeamSplitModal
          deal={modifyDeal}
          participants={participants}
          dealSplitOverrides={dealSplitOverrides}
          onClose={() => setModifyDeal(null)}
          onSaved={() => {
            setModifyDeal(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function TeamMemberCard({
  row,
  participants,
  color,
  canSelect,
  selected,
  onSelectToggle,
  onMarkPaid,
}: {
  row: TeamPayoutRowView;
  participants: InternalCommissionParticipant[];
  color: string;
  canSelect: boolean;
  selected: boolean;
  onSelectToggle: () => void;
  onMarkPaid: () => void;
}) {
  const breakdown = teamPayoutAmountBreakdown(row);

  return (
    <div className="comm-team-payout-card">
      <div className="comm-team-payout-card-head">
        <div className="comm-team-payout-card-identity">
          {canSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelectToggle}
              style={{ marginRight: 4 }}
            />
          )}
          <span className="comm-team-payout-avatar" style={{ background: color }}>
            {initialsForName(row.displayName)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="comm-team-payout-name">{row.displayName}</div>
            <div className="comm-team-payout-role">
              {teamPayoutRoleSubtitle(row, participants)}
            </div>
          </div>
        </div>
        <span
          className={`comm-team-payout-badge ${row.paid ? 'comm-team-payout-badge--paid' : 'comm-team-payout-badge--unpaid'}`}
        >
          {row.paid ? 'Paid' : 'Unpaid'}
        </span>
      </div>

      <div className="comm-team-payout-breakdown">
        <div className="comm-team-payout-breakdown-row">
          <span>Commissions owed</span>
          <span>{formatCommissionCurrency(breakdown.commissions)}</span>
        </div>
        <div className="comm-team-payout-breakdown-row">
          <span>Expenses owed</span>
          <span>{formatCommissionCurrency(breakdown.expensesOwed)}</span>
        </div>
        <div className="comm-team-payout-breakdown-row">
          <span>Charges owed</span>
          <span className={breakdown.charges > 0 ? 'comm-team-payout-breakdown-charge' : undefined}>
            {breakdown.charges > 0
              ? `−${formatCommissionCurrency(breakdown.charges)}`
              : formatCommissionCurrency(0)}
          </span>
        </div>
        <div className="comm-team-payout-breakdown-row comm-team-payout-breakdown-row--total">
          <span>{row.paid ? 'Total (paid)' : 'Total owed this month'}</span>
          <span>{row.paid ? 'Paid' : formatCommissionCurrency(breakdown.total)}</span>
        </div>
      </div>

      <div className="comm-team-payout-metrics">
        <div>
          <div className="comm-team-payout-metric-label">Paid last month</div>
          <div className="comm-team-payout-metric-value comm-team-payout-metric-value--secondary">
            {formatCommissionCurrency(row.lastMonthPaid)}
          </div>
        </div>
        <div>
          <div className="comm-team-payout-metric-label">YTD</div>
          <div className="comm-team-payout-metric-value comm-team-payout-metric-value--secondary">
            {formatCommissionCurrency(row.ytdPaid)}
          </div>
        </div>
      </div>

      {!row.paid && row.currentMonthOwed > 0 && (
        <div className="comm-team-payout-actions">
          <button type="button" className="admin-ticket-btn" onClick={onMarkPaid}>
            Mark paid
          </button>
        </div>
      )}
    </div>
  );
}
