'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  SUPPLIER_IDS,
  SUPPLIER_LABELS,
  type SupplierId,
  type SupplierImportBatch,
  type AgentCommissionRowView,
  type CommissionTrendPoint,
  currentPeriod,
  formatPeriodLabel,
  formatCommissionCurrency,
  formatCellValue,
  formatPeriodDelta,
  getAgentCommissionRows,
  supplierPeriodTotals,
  availableCommissionPeriods,
  commissionTrendSeries,
  periodBefore,
  displayColumnsForSupplier,
  sortCommissionRowsAlphabetically,
  setAgentPaid,
  setAllAgentsPaid,
  setAgentCommissionOverride,
} from '@/lib/commissions/commission-store';
import {
  RECURRING_SUPPLIER_IDS,
  batchIsFullyProjected,
} from '@/lib/commissions/recurring-supplier-projections';
import { fetchSupplierCommissions } from '@/lib/services/supplier-commissions';
import { fetchBankDepositTotalsBySupplier, type BankDepositPeriodTotal } from '@/lib/services/bank-deposits';
import { agentCommIdForDeal, commissionRateForAgent } from '@/lib/bmw/agent-comm-history';
import { getAddedDeal } from '@/lib/bmw/added-deals';
import { resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import { matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import { mergeManualBatches } from '@/lib/commissions/manual-imports';
import NewDealsModal from '@/components/commissions/NewDealsModal';
import ManualImportModal from '@/components/commissions/ManualImportModal';
import VerifyCommissionsModal from '@/components/commissions/VerifyCommissionsModal';
import EscalateCommissionsModal from '@/components/commissions/EscalateCommissionsModal';
import BankDepositsPanel from '@/components/commissions/BankDepositsPanel';
import ExpensesPanel from '@/components/commissions/ExpensesPanel';
import CommissionWorkflowTabs from '@/components/commissions/CommissionWorkflowTabs';
import { DepositMatchIcon, depositMatchStatus } from '@/components/commissions/DepositMatchIcon';
import type { DepositMatchStatus } from '@/lib/bank-deposits/commission-reconcile';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import { mergePaySourceVerifiedIntoTotals } from '@/lib/commissions/verify-commissions';
import {
  commissionUnderpaid,
  isPayoutExcluded,
} from '@/lib/commissions/escalate-commissions';
import { readExpensesComplete } from '@/lib/commissions/workflow-status';

type CommissionsTab = 'deposits' | 'suppliers' | 'expenses' | 'agents';

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`comm-chevron${open ? ' open' : ''}`} aria-hidden>
      ▶
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  depositLabel,
  varianceLabel,
  varianceTone,
  matchStatus,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  depositLabel?: string | null;
  varianceLabel?: string | null;
  varianceTone?: 'over' | 'under' | null;
  matchStatus?: DepositMatchStatus | null;
  accent?: string;
}) {
  return (
    <div className="comm-stat-card" style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}>
      {matchStatus != null && (
        <div className="comm-stat-match">
          <DepositMatchIcon status={matchStatus} />
        </div>
      )}
      <div className="comm-stat-label">{label}</div>
      <div className="comm-stat-value">{value}</div>
      <div className="comm-stat-sub">{sub}</div>
      {depositLabel != null && depositLabel !== '' && (
        <div className="comm-stat-sub comm-stat-deposit">{depositLabel}</div>
      )}
      {varianceLabel != null && varianceLabel !== '' && (
        <div className={`comm-stat-sub comm-stat-variance${varianceTone ? ` comm-stat-variance--${varianceTone}` : ''}`}>
          {varianceLabel}
        </div>
      )}
    </div>
  );
}

const STATUS_ACCENTS: Partial<Record<DepositMatchStatus, string>> = {
  matched: 'var(--green)',
  mismatch: 'var(--amber)',
  no_deposit: 'var(--red)',
  no_commission_data: 'var(--gray)',
};

function CommissionTrendChart({
  trend,
  selectedPeriod,
  onSelectPeriod,
}: {
  trend: CommissionTrendPoint[];
  selectedPeriod: string;
  onSelectPeriod: (period: string) => void;
}) {
  const trendMax = Math.max(...trend.map((m) => m.total), 1);
  const selectedPoint = trend.find((t) => t.period === selectedPeriod);
  const priorPoint = trend.find((t) => t.period === periodBefore(selectedPeriod));
  const selectedTotal = selectedPoint?.total ?? 0;
  const priorTotal = priorPoint?.total ?? 0;
  const delta = formatPeriodDelta(selectedTotal, priorTotal);
  const deltaPositive = selectedTotal >= priorTotal;

  return (
    <div className="card admin-trend-card">
      <div className="card-header">
        <div className="card-title">Commission trend</div>
        <select
          className="comm-period-select"
          value={selectedPeriod}
          onChange={(e) => onSelectPeriod(e.target.value)}
          aria-label="Select commission month"
        >
          {[...trend].reverse().map((point) => (
            <option key={point.period} value={point.period}>
              {formatPeriodLabel(point.period)}
            </option>
          ))}
        </select>
      </div>
      <div className="card-body">
        {trend.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--gray)' }}>No commission history yet.</p>
        ) : (
          <>
            <div className="admin-trend-chart">
              {trend.map((point) => (
                <div key={point.period} className="admin-trend-col">
                  <button
                    type="button"
                    className={`admin-trend-bar comm-trend-bar${point.period === selectedPeriod ? ' selected' : ''}`}
                    style={{ height: `${Math.max(8, Math.round((point.total / trendMax) * 100))}%` }}
                    title={`${formatPeriodLabel(point.period)}: ${formatCommissionCurrency(point.total)}`}
                    aria-label={`${formatPeriodLabel(point.period)}, ${formatCommissionCurrency(point.total)}`}
                    aria-pressed={point.period === selectedPeriod}
                    onClick={() => onSelectPeriod(point.period)}
                  />
                  <div className="admin-trend-month">{point.label}</div>
                </div>
              ))}
            </div>
            <div className="admin-trend-foot">
              <span>{formatPeriodLabel(selectedPeriod)}</span>
              <strong>{formatCommissionCurrency(selectedTotal)}</strong>
              {priorTotal > 0 || selectedTotal > 0 ? (
                <span className={`admin-trend-delta${deltaPositive ? '' : ' comm-trend-delta--down'}`}>
                  {delta}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuppliersPanel({
  imports,
  selectedPeriod,
  onRefresh,
  dealsRevision,
}: {
  imports: SupplierImportBatch[];
  selectedPeriod: string;
  onRefresh: () => void;
  dealsRevision: number;
}) {
  const prev = periodBefore(selectedPeriod);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [depositTotals, setDepositTotals] = useState<Record<string, BankDepositPeriodTotal>>({});
  const [newDealsFor, setNewDealsFor] = useState<SupplierId | null>(null);
  const [manualUploadFor, setManualUploadFor] = useState<SupplierId | null>(null);
  const [verifyFor, setVerifyFor] = useState<{
    sourceKey: string;
    sourceLabel: string;
    supplierId: SupplierId | null;
    depositAmount: number;
  } | null>(null);
  const [escalateFor, setEscalateFor] = useState<{
    supplierId: SupplierId;
    commissionTotal: number;
    depositTotal: number;
  } | null>(null);

  /** Count of line items per supplier (selected period) not tied to a deal in the system. */
  const unmatchedCounts = useMemo(() => {
    void dealsRevision;
    const counts = new Map<SupplierId, number>();
    for (const batch of imports) {
      if (batch.period !== selectedPeriod) continue;
      let n = 0;
      for (const row of batch.rows) {
        if (!matchDealToCommissionRow(batch.supplier, row)) n += 1;
      }
      counts.set(batch.supplier, n);
    }
    return counts;
  }, [imports, selectedPeriod, dealsRevision]);

  useEffect(() => {
    void fetchBankDepositTotalsBySupplier(selectedPeriod)
      .then(setDepositTotals)
      .catch(() => setDepositTotals({}));
  }, [selectedPeriod]);

  const [localRevision, setLocalRevision] = useState(0);
  useEffect(() => {
    const bump = () => setLocalRevision((v) => v + 1);
    window.addEventListener('candid-commissions-updated', bump);
    return () => window.removeEventListener('candid-commissions-updated', bump);
  }, []);

  const entries = useMemo(() => {
    const keys = [
      ...SUPPLIER_IDS,
      ...Object.keys(depositTotals).filter((k) => !(SUPPLIER_IDS as string[]).includes(k)),
    ];
    return keys
      .map((key) => {
        const isKnown = (SUPPLIER_IDS as string[]).includes(key);
        const supplierId = isKnown ? (key as SupplierId) : null;
        const commissionTotal = supplierId
          ? supplierPeriodTotals(imports, supplierId, selectedPeriod)
          : mergePaySourceVerifiedIntoTotals(key, selectedPeriod, 0);
        const hasCommissionImport = supplierId != null
          && imports.some((i) => i.supplier === supplierId && i.period === selectedPeriod);
        const deposit = depositTotals[key];
        const depositTotal = deposit?.total ?? null;
        const label = supplierId ? SUPPLIER_LABELS[supplierId] : deposit?.label ?? key;
        const matchStatus = depositMatchStatus(commissionTotal, depositTotal, hasCommissionImport);
        const variance = depositTotal != null ? depositTotal - commissionTotal : null;
        const underpaid = supplierId != null
          && commissionUnderpaid(commissionTotal, depositTotal, hasCommissionImport);
        const payoutExcluded = supplierId != null && isPayoutExcluded(supplierId, selectedPeriod);
        return {
          key,
          label,
          supplierId,
          commissionTotal,
          hasCommissionImport,
          depositTotal,
          matchStatus,
          variance,
          underpaid,
          payoutExcluded,
        };
      })
      .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
  }, [imports, selectedPeriod, depositTotals, localRevision]);

  return (
    <div>
      <div className="comm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {entries.map((entry) => (
          <StatCard
            key={entry.key}
            label={entry.label}
            value={formatCommissionCurrency(entry.commissionTotal)}
            sub={formatPeriodLabel(selectedPeriod)}
            depositLabel={`Deposit ${formatCommissionCurrency(entry.depositTotal ?? 0)}`}
            varianceLabel={
              entry.variance != null
                ? `Variance ${entry.variance > 0 ? '+' : '−'}${formatCommissionCurrency(Math.abs(entry.variance))}`
                : null
            }
            varianceTone={entry.variance != null ? (entry.variance > 0 ? 'over' : 'under') : null}
            matchStatus={entry.matchStatus}
            accent={STATUS_ACCENTS[entry.matchStatus]}
          />
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Supplier reports — {formatPeriodLabel(selectedPeriod)}</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-mini-table comm-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Supplier</th>
                <th>Period</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Deposit amount</th>
                <th style={{ textAlign: 'right' }}>Variance</th>
                <th style={{ textAlign: 'right' }}>Previous month</th>
                <th style={{ textAlign: 'right', width: 280 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const supplier = entry.supplierId;
                if (!supplier) {
                  const depositTotal = entry.depositTotal ?? 0;
                  const showZeroActions = entry.commissionTotal === 0 && depositTotal > 0;
                  return (
                    <tr key={entry.key}>
                      <td />
                      <td style={{ fontWeight: 600 }}>{entry.label}</td>
                      <td>{formatPeriodLabel(selectedPeriod)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {formatCommissionCurrency(entry.commissionTotal)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {depositTotal > 0 ? formatCommissionCurrency(depositTotal) : '—'}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          color: entry.variance != null && Math.abs(entry.variance) > 0.02
                            ? 'var(--red)'
                            : 'var(--gray)',
                        }}
                      >
                        {entry.variance != null && depositTotal > 0
                          ? `${entry.variance > 0 ? '+' : '−'}${formatCommissionCurrency(Math.abs(entry.variance))}`
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>—</td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        {showZeroActions ? (
                          <div className="admin-alert-actions" style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="admin-ticket-btn primary"
                              onClick={() => setVerifyFor({
                                sourceKey: entry.key,
                                sourceLabel: entry.label,
                                supplierId: null,
                                depositAmount: depositTotal,
                              })}
                            >
                              Verify
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--gray)' }}>
                            Deposit {formatCommissionCurrency(depositTotal)} · no commissions imported
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                }

                const periodTotal = entry.commissionTotal;
                const prevTotal = supplierPeriodTotals(imports, supplier, prev);
                const batch = imports.find((i) => i.supplier === supplier && i.period === selectedPeriod);
                const isOpen = expandedId === supplier;
                const showEscalate = entry.underpaid && !entry.payoutExcluded;
                const depositTotal = entry.depositTotal ?? 0;

                return (
                  <Fragment key={supplier}>
                    <tr
                      className="comm-row-clickable"
                      onClick={() => setExpandedId(isOpen ? null : supplier)}
                    >
                      <td>
                        <Chevron open={isOpen} />
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {SUPPLIER_LABELS[supplier]}
                        {entry.payoutExcluded && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              color: 'var(--amber)',
                            }}
                          >
                            Payout excluded
                          </span>
                        )}
                      </td>
                      <td>{formatPeriodLabel(selectedPeriod)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {formatCommissionCurrency(periodTotal)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {depositTotal > 0 ? formatCommissionCurrency(depositTotal) : '—'}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          color: entry.variance != null && Math.abs(entry.variance) > 0.02
                            ? 'var(--red)'
                            : 'var(--gray)',
                        }}
                      >
                        {entry.variance != null && depositTotal > 0
                          ? `${entry.variance > 0 ? '+' : '−'}${formatCommissionCurrency(Math.abs(entry.variance))}`
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {formatCommissionCurrency(prevTotal)}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div className="admin-alert-actions" style={{ justifyContent: 'flex-end' }}>
                          {batch && (unmatchedCounts.get(supplier) ?? 0) > 0 && (
                            <button
                              type="button"
                              className="admin-ticket-btn"
                              onClick={() => setNewDealsFor(supplier)}
                            >
                              New Deal(s) ({unmatchedCounts.get(supplier)})
                            </button>
                          )}
                          {periodTotal === 0 && depositTotal > 0 && (
                            <>
                              <button
                                type="button"
                                className="admin-ticket-btn"
                                onClick={() => setManualUploadFor(supplier)}
                              >
                                Manual upload
                              </button>
                              <button
                                type="button"
                                className="admin-ticket-btn primary"
                                onClick={() => setVerifyFor({
                                  sourceKey: entry.key,
                                  sourceLabel: paySourceForSupplier(supplier),
                                  supplierId: supplier,
                                  depositAmount: depositTotal,
                                })}
                              >
                                Verify
                              </button>
                            </>
                          )}
                          {showEscalate && (
                            <button
                              type="button"
                              className="admin-ticket-btn"
                              style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                              onClick={() => setEscalateFor({
                                supplierId: supplier,
                                commissionTotal: periodTotal,
                                depositTotal,
                              })}
                            >
                              Escalate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, background: 'var(--gray-light)' }}>
                          <SupplierDetail
                            imports={imports.filter((i) => i.supplier === supplier)}
                            selectedPeriod={selectedPeriod}
                            dealsRevision={dealsRevision}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {newDealsFor && (
        <NewDealsModal
          supplier={newDealsFor}
          batch={imports.find((i) => i.supplier === newDealsFor && i.period === selectedPeriod)}
          onClose={() => setNewDealsFor(null)}
        />
      )}
      {manualUploadFor && (
        <ManualImportModal
          supplier={manualUploadFor}
          period={selectedPeriod}
          onClose={() => setManualUploadFor(null)}
          onSaved={onRefresh}
        />
      )}
      {verifyFor && (
        <VerifyCommissionsModal
          sourceKey={verifyFor.sourceKey}
          sourceLabel={verifyFor.sourceLabel}
          supplierId={verifyFor.supplierId}
          period={selectedPeriod}
          depositAmount={verifyFor.depositAmount}
          imports={imports}
          onClose={() => setVerifyFor(null)}
          onSaved={onRefresh}
        />
      )}
      {escalateFor && (
        <EscalateCommissionsModal
          supplierId={escalateFor.supplierId}
          period={selectedPeriod}
          commissionTotal={escalateFor.commissionTotal}
          depositTotal={escalateFor.depositTotal}
          imports={imports}
          onClose={() => setEscalateFor(null)}
          onExcluded={onRefresh}
        />
      )}
    </div>
  );
}

function SupplierDetail({
  imports,
  selectedPeriod,
  dealsRevision,
}: {
  imports: SupplierImportBatch[];
  selectedPeriod: string;
  dealsRevision: number;
}) {
  const defaultBatch =
    imports.find((i) => i.period === selectedPeriod) ?? imports[0];
  const [batchId, setBatchId] = useState(defaultBatch?.id ?? '');
  const batch = imports.find((i) => i.id === batchId) ?? defaultBatch;

  useEffect(() => {
    const forPeriod = imports.find((i) => i.period === selectedPeriod);
    if (forPeriod) {
      setBatchId(forPeriod.id);
      return;
    }
    if (imports.length && !imports.some((i) => i.id === batchId)) {
      setBatchId(imports[0]!.id);
    }
  }, [imports, batchId, selectedPeriod]);

  const cols = useMemo(
    () => (batch ? displayColumnsForSupplier(batch.supplier, batch.rows) : []),
    [batch],
  );
  const sortedRows = useMemo(
    () => (batch ? sortCommissionRowsAlphabetically(batch.supplier, batch.rows) : []),
    [batch, dealsRevision],
  );

  if (!batch) {
    return (
      <p style={{ padding: 20, fontSize: 13, color: 'var(--gray)' }}>
        No commission data for {formatPeriodLabel(selectedPeriod)}.
      </p>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      {imports.length > 1 && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {imports.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`admin-tickets-tab${batchId === b.id ? ' active' : ''}`}
              onClick={() => setBatchId(b.id)}
            >
              {b.period} · {formatCommissionCurrency(b.totalAmount)}
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
        {formatPeriodLabel(batch.period)} · {batch.rowCount} rows · {formatCommissionCurrency(batch.totalAmount)}
        {RECURRING_SUPPLIER_IDS.includes(batch.supplier) && batchIsFullyProjected(batch) && (
          <> · recurring amount carried forward from last import</>
        )}
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 320 }}>
        <table className="admin-mini-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c.replace(/_/g, ' ')}</th>
              ))}
              <th>Agent</th>
              <th style={{ textAlign: 'right' }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => {
              const deal = matchDealToCommissionRow(batch.supplier, row);
              const added = deal ? getAddedDeal(batch.supplier, deal.dealUid) : undefined;
              const agentCommId = deal ? agentCommIdForDeal(deal, batch.period) : '';
              const agentName = agentCommId ? resolveAgentDisplayName(agentCommId) : '—';
              const commissionRate = added
                ? added.commissionRate
                : agentCommId
                  ? commissionRateForAgent(agentCommId, batch.period)
                  : null;

              return (
              <tr key={idx}>
                {cols.map((c) => (
                  <td key={c}>{formatCellValue(row[c], c)}</td>
                ))}
                <td>{agentName}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {commissionRate != null ? `${commissionRate}%` : '—'}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentsPanel({
  agents,
  period,
  onRefresh,
}: {
  agents: AgentCommissionRowView[];
  period: string;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const unpaidIds = useMemo(
    () => agents.filter((a) => !a.paid && a.currentMonthOwed > 0).map((a) => a.agentId),
    [agents],
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
    setAllAgentsPaid(ids, true, period);
    setSelected(new Set());
    onRefresh();
  };

  const handleModify = (agent: AgentCommissionRowView) => {
    const raw = window.prompt(
      `Adjust commission owed for ${agent.company} (${formatPeriodLabel(period)}):`,
      String(agent.currentMonthOwed),
    );
    if (raw == null) return;
    const n = Number(raw.replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(n)) return;
    setAgentCommissionOverride(agent.agentId, n, period);
    onRefresh();
  };

  const sendPaidEmails = () => {
    const paidAgents = agents.filter((a) => a.paid || selected.has(a.agentId));
    if (!paidAgents.length) {
      setEmailNotice('Select agents or mark as paid before sending email.');
      return;
    }
    setEmailNotice(
      `Payment confirmation queued for ${paidAgents.map((a) => a.contactEmail).join(', ')}.`,
    );
    setTimeout(() => setEmailNotice(null), 5000);
  };

  const totals = useMemo(
    () => ({
      owed: agents.reduce((s, a) => s + (a.paid ? 0 : a.currentMonthOwed), 0),
      ytd: agents.reduce((s, a) => s + a.ytdPaid, 0),
      lastPaid: agents.reduce((s, a) => s + a.lastMonthPaid, 0),
    }),
    [agents],
  );

  return (
    <div>
      {emailNotice && (
        <div className="comm-email-notice">{emailNotice}</div>
      )}

      <div className="comm-stat-grid">
        <StatCard label="Owed this month" value={formatCommissionCurrency(totals.owed)} sub={formatPeriodLabel(period)} accent="var(--red)" />
        <StatCard label="Paid last month" value={formatCommissionCurrency(totals.lastPaid)} sub="All agents" accent="var(--green)" />
        <StatCard label="Year to date" value={formatCommissionCurrency(totals.ytd)} sub="Paid + accrued" accent="var(--blue)" />
        <StatCard label="Unpaid agents" value={String(unpaidIds.length)} sub="Awaiting payout" accent="var(--amber)" />
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
        <button type="button" className="admin-ticket-btn" onClick={sendPaidEmails}>
          Send paid email
        </button>
      </div>

      {agents.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', padding: '8px 0 16px' }}>
          No agent payouts mapped for {formatPeriodLabel(period)}. Commission rows need a matching Deal_UID in the BMW deal master.
        </p>
      ) : null}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-mini-table comm-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th style={{ width: 36 }} />
                <th>Agent</th>
                <th style={{ textAlign: 'right' }}>Current month owed</th>
                <th style={{ textAlign: 'right' }}>Last month paid</th>
                <th style={{ textAlign: 'right' }}>YTD</th>
                <th style={{ textAlign: 'right', width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const open = expandedId === agent.agentId;
                const canSelect = !agent.paid && agent.currentMonthOwed > 0;
                return (
                  <Fragment key={agent.agentId}>
                    <tr className="comm-row-clickable">
                      <td onClick={(e) => e.stopPropagation()}>
                        {canSelect && (
                          <input
                            type="checkbox"
                            checked={selected.has(agent.agentId)}
                            onChange={() => toggleOne(agent.agentId)}
                          />
                        )}
                      </td>
                      <td onClick={() => setExpandedId(open ? null : agent.agentId)}>
                        <Chevron open={open} />
                      </td>
                      <td onClick={() => setExpandedId(open ? null : agent.agentId)}>
                        <div style={{ fontWeight: 600 }}>{agent.company}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>{agent.contactEmail}</div>
                      </td>
                      <td
                        style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                        onClick={() => setExpandedId(open ? null : agent.agentId)}
                      >
                        {agent.paid ? (
                          <span className="admin-status-pill admin-status-pill--resolved">Paid</span>
                        ) : (
                          formatCommissionCurrency(agent.currentMonthOwed)
                        )}
                      </td>
                      <td
                        style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                        onClick={() => setExpandedId(open ? null : agent.agentId)}
                      >
                        {formatCommissionCurrency(agent.lastMonthPaid)}
                      </td>
                      <td
                        style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                        onClick={() => setExpandedId(open ? null : agent.agentId)}
                      >
                        {formatCommissionCurrency(agent.ytdPaid)}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div className="admin-alert-actions" style={{ justifyContent: 'flex-end' }}>
                          {!agent.paid && (
                            <button
                              type="button"
                              className="admin-ticket-btn primary"
                              onClick={() => {
                                setAgentPaid(agent.agentId, true, period, agent.currentMonthOwed);
                                onRefresh();
                              }}
                            >
                              Mark paid
                            </button>
                          )}
                          <button type="button" className="admin-ticket-btn" onClick={() => handleModify(agent)}>
                            Modify
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, background: 'var(--gray-light)' }}>
                          <div style={{ padding: '14px 20px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 10 }}>
                              Customers ({agent.customers.length})
                            </div>
                            {agent.customers.length === 0 ? (
                              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No customer breakdown on file.</p>
                            ) : (
                              <table className="admin-mini-table">
                                <thead>
                                  <tr>
                                    <th>Customer</th>
                                    <th>Supplier</th>
                                    <th style={{ textAlign: 'right' }}>Rate</th>
                                    <th style={{ textAlign: 'right' }}>Residual</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {agent.customers.map((c) => (
                                    <tr key={c.id}>
                                      <td>{c.company}</td>
                                      <td>{c.supplier}</td>
                                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                                        {c.commissionRate}%
                                      </td>
                                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                        {formatCommissionCurrency(c.amount)}
                                      </td>
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
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CommissionsView() {
  const [tab, setTab] = useState<CommissionsTab>('deposits');
  const [imports, setImports] = useState<SupplierImportBatch[]>([]);
  const [agents, setAgents] = useState<AgentCommissionRowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supplierErrors, setSupplierErrors] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod());
  const [dealsRevision, setDealsRevision] = useState(0);
  const [depositTotals, setDepositTotals] = useState<Record<string, BankDepositPeriodTotal>>({});
  const [workflowRevision, setWorkflowRevision] = useState(0);
  const [expensesComplete, setExpensesCompleteFlag] = useState(false);

  const trend = useMemo(() => commissionTrendSeries(imports), [imports]);
  const availablePeriods = useMemo(() => availableCommissionPeriods(imports), [imports]);

  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (action === 'focus-deposits') setTab('deposits');
      else if (action === 'focus-suppliers') setTab('suppliers');
      else if (action === 'focus-expenses') setTab('expenses');
      else if (action === 'focus-agents') setTab('agents');
    };
    window.addEventListener('candid-assistant-action', handler);
    return () => window.removeEventListener('candid-assistant-action', handler);
  }, []);

  useEffect(() => {
    if (!availablePeriods.length) return;
    if (!availablePeriods.includes(selectedPeriod)) {
      setSelectedPeriod(availablePeriods[0]!);
    }
  }, [availablePeriods, selectedPeriod]);

  const refreshAgents = useCallback(() => {
    setAgents(getAgentCommissionRows({ imports, period: selectedPeriod }));
  }, [imports, selectedPeriod]);

  const refreshSuppliers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { batches, errors } = await fetchSupplierCommissions();
      setImports(mergeManualBatches(batches));
      setSupplierErrors(errors.map((e) => `${e.supplier}: ${e.message}`));
    } catch (err) {
      setSupplierErrors([]);
      setLoadError(
        err instanceof Error ? err.message : 'Could not load supplier commissions from the database.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSuppliers();
  }, [refreshSuppliers]);

  useEffect(() => {
    refreshAgents();
  }, [refreshAgents]);

  useEffect(() => {
    const onUpdate = () => {
      refreshAgents();
      setDealsRevision((r) => r + 1);
      setWorkflowRevision((r) => r + 1);
      setExpensesCompleteFlag(readExpensesComplete(selectedPeriod));
    };
    window.addEventListener('candid-commissions-updated', onUpdate);
    return () => window.removeEventListener('candid-commissions-updated', onUpdate);
  }, [refreshAgents, selectedPeriod]);

  useEffect(() => {
    setExpensesCompleteFlag(readExpensesComplete(selectedPeriod));
  }, [selectedPeriod, workflowRevision]);

  useEffect(() => {
    void fetchBankDepositTotalsBySupplier(selectedPeriod)
      .then(setDepositTotals)
      .catch(() => setDepositTotals({}));
  }, [selectedPeriod, workflowRevision]);

  return (
    <div>
      {!loading && !loadError && imports.length > 0 && (
        <CommissionTrendChart
          trend={trend}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={setSelectedPeriod}
        />
      )}

      <CommissionWorkflowTabs
        tab={tab}
        onTab={setTab}
        period={selectedPeriod}
        imports={imports}
        depositTotals={depositTotals}
        agents={agents}
        expensesComplete={expensesComplete}
      />

      {supplierErrors.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--amber-light)',
            border: '1px solid rgba(217, 119, 6, 0.25)',
            fontSize: 13,
            color: 'var(--amber)',
          }}
        >
          Some supplier tables could not be loaded: {supplierErrors.join(' · ')}
        </div>
      )}

      {tab === 'deposits' ? (
        loading && !imports.length ? (
          <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading commission data for matching…</p>
        ) : (
          <BankDepositsPanel commissionImports={imports} />
        )
      ) : tab === 'suppliers' ? (
        loading ? (
          <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading supplier reports…</p>
        ) : loadError ? (
          <div>
            <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>{loadError}</p>
            <button type="button" className="admin-ticket-btn primary" onClick={() => void refreshSuppliers()}>
              Retry
            </button>
          </div>
        ) : (
          <SuppliersPanel
            imports={imports}
            selectedPeriod={selectedPeriod}
            onRefresh={() => void refreshSuppliers()}
            dealsRevision={dealsRevision}
          />
        )
      ) : tab === 'expenses' ? (
        <ExpensesPanel period={selectedPeriod} />
      ) : (
        <AgentsPanel agents={agents} period={selectedPeriod} onRefresh={refreshAgents} />
      )}
    </div>
  );
}

export default CommissionsView;
