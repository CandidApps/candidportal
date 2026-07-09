'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  SUPPLIER_IDS,
  SUPPLIER_LABELS,
  type SupplierId,
  type SupplierImportBatch,
  type AgentCommissionRowView,
  type AgentCommissionCustomer,
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
import { getBmwAgentRates, getBmwDeals, invalidateDealIndexes, rebuildAgentRateIndex } from '@/lib/bmw/deal-master';
import {
  agentRateForCommissionPeriod,
  displayAgentForCommission,
} from '@/lib/agents/agent-lifecycle';
import { overridePayoutLinesForDeal } from '@/lib/agents/agent-override-partners';
import { commissionRowAmountForBatch } from '@/lib/commissions/supplier-config';
import { syncAgentProfilesFromServer } from '@/lib/agents/agent-assignments';
import { matchDealToCommissionRow } from '@/lib/bmw/commission-match';
import { resolveAgentCommIdForCommissionRow } from '@/lib/commissions/commission-deal-prefill';
import { mergeManualBatches, syncLocalManualImportsToServer } from '@/lib/commissions/manual-imports';
import { groupAgentCustomersBySupplier } from '@/lib/commissions/agent-payment-breakdown';
import { useCrmData } from '@/components/CrmDataProvider';
import { hydrateCrmRuntime } from '@/lib/crm/hydrate-runtime';
import { getCrmRuntimeData } from '@/lib/crm/runtime-store';
import NewDealsModal from '@/components/commissions/NewDealsModal';
import ManualImportModal from '@/components/commissions/ManualImportModal';
import VerifyCommissionsModal from '@/components/commissions/VerifyCommissionsModal';
import EscalateCommissionsModal from '@/components/commissions/EscalateCommissionsModal';
import { ReconcileVarianceModal } from '@/components/commissions/ReconcileVarianceModal';
import BankDepositsPanel from '@/components/commissions/BankDepositsPanel';
import ExpensesPanel from '@/components/commissions/ExpensesPanel';
import TeamPayoutsPanel from '@/components/commissions/TeamPayoutsPanel';
import CommissionWorkflowTabs from '@/components/commissions/CommissionWorkflowTabs';
import { DepositMatchIcon, depositMatchStatus } from '@/components/commissions/DepositMatchIcon';
import type { DepositMatchStatus } from '@/lib/bank-deposits/commission-reconcile';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import { mergePaySourceVerifiedIntoTotals, paySourceVerifiedRows } from '@/lib/commissions/verify-commissions';
import {
  commissionUnderpaid,
  isPayoutExcluded,
  paySourceNeedsEscalation,
} from '@/lib/commissions/escalate-commissions';
import { readExpensesComplete } from '@/lib/commissions/workflow-status';
import { exportSupplierReportsXlsx } from '@/lib/commissions/supplier-reports-export';
import { exportAgentPaymentsXlsx } from '@/lib/commissions/agent-payments-export';
import {
  applyExpenseDeductionsToAgentRows,
  applyExpenseAdjustmentsToTeamRows,
  type CommissionExpenseRow,
} from '@/lib/commissions/expense-review';
import {
  adjustmentsForSupplier,
  applyReconciliationToAgentRows,
  applyReconciliationToTeamRows,
  RECONCILIATION_TOLERANCE,
  RESOLUTION_LABELS,
  reconciledSupplierTotal,
  remainingVariance,
  type SupplierPeriodAdjustment,
} from '@/lib/commissions/supplier-reconciliation';
import { mergeCommissionImportBatches } from '@/lib/commissions/merge-import-batches';
import { agentCommissionPeriods } from '@/lib/commissions/period-utils';
import type { BmwAgentRate } from '@/lib/bmw/types';
import { buildTeamPayoutRows } from '@/lib/team/internal-commission-engine';
import { attachTeamPayoutPaidState } from '@/lib/commissions/team-payout-store';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import type { InternalDealSplit } from '@/lib/services/internal-deal-splits-db';

type CommissionsTab = 'deposits' | 'suppliers' | 'expenses' | 'agents' | 'team';

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`comm-chevron${open ? ' open' : ''}`} aria-hidden>
      ▶
    </span>
  );
}

const VARIANCE_TOLERANCE = 0.02;

function varianceCellColor(variance: number | null | undefined): string {
  if (variance == null || Math.abs(variance) <= VARIANCE_TOLERANCE) return 'var(--gray)';
  return variance > 0 ? 'var(--green)' : 'var(--red)';
}

function SupplierTableName({
  matchStatus,
  children,
}: {
  matchStatus: DepositMatchStatus;
  children: ReactNode;
}) {
  return (
    <span className="comm-table-supplier-name">
      <DepositMatchIcon status={matchStatus} />
      {children}
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

type ReconcileModalState = {
  supplierId: SupplierId;
  importTotal: number;
  depositTotal: number;
  variance: number;
  existingAdjustment: SupplierPeriodAdjustment | null;
};

function SuppliersPanel({
  imports,
  selectedPeriod,
  onRefresh,
  dealsRevision,
  adjustments,
  agentRates,
  onAdjustmentsRefresh,
  onOpenReconcile,
  dataRevision,
}: {
  imports: SupplierImportBatch[];
  selectedPeriod: string;
  onRefresh: () => void;
  dealsRevision: number;
  adjustments: SupplierPeriodAdjustment[];
  agentRates: BmwAgentRate[];
  onAdjustmentsRefresh: () => void | Promise<void | boolean>;
  onOpenReconcile: (state: ReconcileModalState) => void;
  dataRevision: number;
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
    supplierId: SupplierId | null;
    sourceKey?: string;
    sourceLabel?: string;
    commissionTotal: number;
    depositTotal: number;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

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
        const importTotal = supplierId
          ? supplierPeriodTotals(imports, supplierId, selectedPeriod)
          : mergePaySourceVerifiedIntoTotals(key, selectedPeriod, 0);
        const reconciledTotal = supplierId
          ? reconciledSupplierTotal(importTotal, adjustments, supplierId, selectedPeriod)
          : importTotal;
        const hasCommissionImport = supplierId != null
          && imports.some((i) => i.supplier === supplierId && i.period === selectedPeriod);
        const deposit = depositTotals[key];
        const depositTotal = deposit?.total ?? null;
        const label = supplierId ? SUPPLIER_LABELS[supplierId] : deposit?.label ?? key;
        const matchStatus = depositMatchStatus(reconciledTotal, depositTotal, hasCommissionImport);
        const variance = supplierId
          ? remainingVariance(importTotal, depositTotal, adjustments, supplierId, selectedPeriod)
          : depositTotal != null ? depositTotal - importTotal : null;
        const underpaid = supplierId != null
          && commissionUnderpaid(importTotal, depositTotal, hasCommissionImport);
        const payoutExcluded = supplierId != null && isPayoutExcluded(supplierId, selectedPeriod);
        const supplierAdjustment = supplierId
          ? adjustmentsForSupplier(adjustments, supplierId, selectedPeriod)[0] ?? null
          : null;
        const showReconcile = supplierId != null
          && depositTotal != null
          && depositTotal > 0
          && hasCommissionImport
          && variance != null
          && Math.abs(variance) > RECONCILIATION_TOLERANCE;
        return {
          key,
          label,
          supplierId,
          importTotal,
          commissionTotal: reconciledTotal,
          hasCommissionImport,
          depositTotal,
          matchStatus,
          variance,
          underpaid,
          payoutExcluded,
          supplierAdjustment,
          showReconcile,
        };
      })
      .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
  }, [imports, selectedPeriod, depositTotals, localRevision, dataRevision, adjustments]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportSupplierReportsXlsx(
        selectedPeriod,
        imports,
        entries.map((e) => ({
          key: e.key,
          label: e.label,
          supplierId: e.supplierId,
          commissionTotal: e.commissionTotal,
          depositTotal: e.depositTotal,
          variance: e.variance,
        })),
        adjustments,
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="comm-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {entries.map((entry) => (
          <StatCard
            key={entry.key}
            label={entry.label}
            value={formatCommissionCurrency(entry.importTotal ?? entry.commissionTotal)}
            sub={
              entry.supplierAdjustment
                ? `${formatPeriodLabel(selectedPeriod)} · Reconciled`
                : formatPeriodLabel(selectedPeriod)
            }
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
        <div className="card-header assist-email-head">
          <div className="card-title">Supplier reports — {formatPeriodLabel(selectedPeriod)}</div>
          <button
            type="button"
            className="admin-ticket-btn"
            disabled={exporting || entries.length === 0}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="comm-table-scroll">
          <table className="admin-mini-table comm-table comm-table--wide">
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
                  const verifiedLines = paySourceVerifiedRows(entry.key, selectedPeriod);
                  const isOpen = expandedId === entry.key;
                  const showPaySourceEscalate = paySourceNeedsEscalation(
                    entry.commissionTotal,
                    entry.depositTotal,
                  );
                  const canExpand = verifiedLines.length > 0 || entry.commissionTotal > 0;
                  return (
                    <Fragment key={entry.key}>
                    <tr
                      className={canExpand ? 'comm-row-clickable' : undefined}
                      onClick={canExpand ? () => setExpandedId(isOpen ? null : entry.key) : undefined}
                    >
                      <td>{canExpand ? <Chevron open={isOpen} /> : null}</td>
                      <td style={{ fontWeight: 600 }}>
                        <SupplierTableName matchStatus={entry.matchStatus}>
                          {entry.label}
                        </SupplierTableName>
                      </td>
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
                          color: varianceCellColor(entry.variance),
                        }}
                      >
                        {entry.variance != null && depositTotal > 0
                          ? `${entry.variance > 0 ? '+' : '−'}${formatCommissionCurrency(Math.abs(entry.variance))}`
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>—</td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div className="admin-alert-actions" style={{ justifyContent: 'flex-end' }}>
                          {depositTotal > 0 && (
                            <button
                              type="button"
                              className={`admin-ticket-btn${entry.commissionTotal === 0 ? ' primary' : ''}`}
                              onClick={() => setVerifyFor({
                                sourceKey: entry.key,
                                sourceLabel: entry.label,
                                supplierId: null,
                                depositAmount: depositTotal,
                              })}
                            >
                              Verify
                            </button>
                          )}
                          {showPaySourceEscalate && (
                            <button
                              type="button"
                              className="admin-ticket-btn"
                              style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                              onClick={() => setEscalateFor({
                                supplierId: null,
                                sourceKey: entry.key,
                                sourceLabel: entry.label,
                                commissionTotal: entry.commissionTotal,
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
                        <td colSpan={8} className="comm-expanded-cell">
                          <PaySourceSupplierDetail
                            sourceKey={entry.key}
                            label={entry.label}
                            selectedPeriod={selectedPeriod}
                            dealsRevision={dealsRevision}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                }

                const periodTotal = entry.importTotal ?? entry.commissionTotal;
                const prevTotal = supplierPeriodTotals(imports, supplier, prev);
                const batch = imports.find((i) => i.supplier === supplier && i.period === selectedPeriod);
                const isOpen = expandedId === supplier;
                const showEscalate = !entry.payoutExcluded && (
                  entry.underpaid
                  || (entry.matchStatus === 'no_deposit' && entry.hasCommissionImport && periodTotal > 0)
                );
                const depositTotal = entry.depositTotal ?? 0;
                const reconcileVariance = entry.variance ?? 0;

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
                        <SupplierTableName matchStatus={entry.matchStatus}>
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
                          {entry.supplierAdjustment && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: 'var(--green)',
                              }}
                            >
                              Reconciled
                            </span>
                          )}
                        </SupplierTableName>
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
                          color: varianceCellColor(entry.variance),
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
                          <button
                            type="button"
                            className="admin-ticket-btn"
                            onClick={() => setManualUploadFor(supplier)}
                          >
                            {entry.hasCommissionImport ? 'Reupload' : 'Manual upload'}
                          </button>
                          {batch && (unmatchedCounts.get(supplier) ?? 0) > 0 && (
                            <button
                              type="button"
                              className="admin-ticket-btn"
                              onClick={() => setNewDealsFor(supplier)}
                            >
                              New Deal(s) ({unmatchedCounts.get(supplier)})
                            </button>
                          )}
                          {depositTotal > 0 && (
                            <button
                              type="button"
                              className={`admin-ticket-btn${periodTotal === 0 ? ' primary' : ''}`}
                              onClick={() => setVerifyFor({
                                sourceKey: entry.key,
                                sourceLabel: paySourceForSupplier(supplier),
                                supplierId: supplier,
                                depositAmount: depositTotal,
                              })}
                            >
                              Verify
                            </button>
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
                          {(entry.showReconcile || entry.supplierAdjustment) && (
                            <button
                              type="button"
                              className={`admin-ticket-btn${entry.showReconcile ? ' primary' : ''}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onOpenReconcile({
                                  supplierId: supplier,
                                  importTotal: periodTotal,
                                  depositTotal,
                                  variance: reconcileVariance,
                                  existingAdjustment: entry.supplierAdjustment,
                                });
                              }}
                            >
                              {entry.supplierAdjustment ? 'Edit reconcile' : 'Reconcile'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} className="comm-expanded-cell">
                          <SupplierDetail
                            supplierId={supplier}
                            imports={imports.filter((i) => i.supplier === supplier)}
                            selectedPeriod={selectedPeriod}
                            dealsRevision={dealsRevision}
                            adjustments={adjustments}
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
          hasExistingData={imports.some(
            (i) => i.supplier === manualUploadFor && i.period === selectedPeriod,
          )}
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
          sourceKey={escalateFor.sourceKey}
          sourceLabel={escalateFor.sourceLabel}
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
  supplierId,
  imports,
  selectedPeriod,
  dealsRevision,
  adjustments,
}: {
  supplierId: SupplierId;
  imports: SupplierImportBatch[];
  selectedPeriod: string;
  dealsRevision: number;
  adjustments: SupplierPeriodAdjustment[];
}) {
  const periodImports = useMemo(
    () => imports.filter((i) => i.period === selectedPeriod),
    [imports, selectedPeriod],
  );
  const defaultBatch = periodImports[0];
  const [batchId, setBatchId] = useState(defaultBatch?.id ?? '');
  const batch = periodImports.find((i) => i.id === batchId) ?? defaultBatch;
  const [resolvedRows, setResolvedRows] = useState<Record<string, unknown>[] | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const adjustment = adjustmentsForSupplier(adjustments, supplierId, selectedPeriod)[0] ?? null;

  useEffect(() => {
    const forPeriod = periodImports[0];
    if (forPeriod) {
      setBatchId(forPeriod.id);
    } else {
      setBatchId('');
    }
  }, [periodImports, selectedPeriod]);

  useEffect(() => {
    setResolvedRows(null);
    if (!batch || batch.rows.length > 0) return;
    if (batch.rowCount === 0 && batch.totalAmount === 0) return;

    let cancelled = false;
    setLoadingRows(true);
    void fetchSupplierCommissions({ periods: [selectedPeriod] })
      .then(({ batches }) => {
        if (cancelled) return;
        const merged = mergeManualBatches(batches);
        const refreshed = merged.find(
          (b) => b.supplier === supplierId && b.period === selectedPeriod,
        );
        if (refreshed?.rows.length) setResolvedRows(refreshed.rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batch, selectedPeriod, supplierId]);

  const effectiveRows = resolvedRows ?? batch?.rows ?? [];

  const cols = useMemo(
    () => (batch ? displayColumnsForSupplier(batch.supplier, effectiveRows) : []),
    [batch, effectiveRows],
  );
  const sortedRows = useMemo(
    () => (batch ? sortCommissionRowsAlphabetically(batch.supplier, effectiveRows) : []),
    [batch, effectiveRows, dealsRevision],
  );

  const displayRows = useMemo(() => {
    if (!batch) return [];
    const rates = getBmwAgentRates();
    return sortedRows.map((row) => {
      const deal = matchDealToCommissionRow(batch.supplier, row);
      const added = deal ? getAddedDeal(batch.supplier, deal.dealUid) : undefined;
      const dealAgentCommId = deal ? agentCommIdForDeal(deal, batch.period) : '';
      const agentCommId = resolveAgentCommIdForCommissionRow(
        row,
        deal,
        rates,
        dealAgentCommId,
      );
      const agentName = agentCommId
        ? displayAgentForCommission(agentCommId, batch.period)
        : '—';
      const overrideLines = agentCommId
        ? overridePayoutLinesForDeal(
            commissionRowAmountForBatch(batch, row),
            agentCommId,
            batch.period,
          )
        : [];
      const agentDisplay = overrideLines.length > 0
        ? `${agentName} · Override: ${overrideLines
            .map(
              (line) =>
                `${displayAgentForCommission(line.overrideCommId, batch.period)} (${line.overrideRate}%)`,
            )
            .join(', ')}`
        : agentName;
      const rawRate = added
        ? added.commissionRate
        : agentCommId
          ? commissionRateForAgent(agentCommId, batch.period)
          : null;
      const commissionRate =
        agentCommId && rawRate != null
          ? agentRateForCommissionPeriod(agentCommId, batch.period, rawRate)
          : null;
      return { row, agentDisplay, commissionRate };
    });
  }, [batch, sortedRows, dealsRevision]);

  if (!batch) {
    return (
      <p style={{ padding: 20, fontSize: 13, color: 'var(--gray)' }}>
        No commission data for {formatPeriodLabel(selectedPeriod)}.
      </p>
    );
  }

  const rowCount = Math.max(batch.rowCount, effectiveRows.length);

  return (
    <div style={{ padding: '16px 20px' }}>
      {imports.length > 1 && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {periodImports.map((b) => (
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
        {formatPeriodLabel(batch.period)} · {rowCount} rows · {formatCommissionCurrency(batch.totalAmount)}
        {loadingRows ? ' · loading deal lines…' : null}
        {RECURRING_SUPPLIER_IDS.includes(batch.supplier) && batchIsFullyProjected(batch) && (
          <> · recurring amount carried forward from last import</>
        )}
      </div>
      {adjustment && (
        <div className="comm-reconcile-banner">
          <strong>Reconciliation:</strong> {RESOLUTION_LABELS[adjustment.resolutionType]}
          {' · '}
          {formatCommissionCurrency(adjustment.amount)}
          {adjustment.note ? ` · ${adjustment.note}` : ''}
        </div>
      )}
      {sortedRows.length === 0 && !loadingRows ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0 }}>
          {rowCount > 0
            ? 'Deal lines could not be loaded. Try refreshing or re-importing this supplier report.'
            : adjustment
              ? 'Totals include a reconciliation adjustment; no individual deal lines on file.'
              : 'No deal lines for this period.'}
        </p>
      ) : (
      <div className="comm-detail-scroll">
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
            {displayRows.map(({ row, agentDisplay, commissionRate }, idx) => (
              <tr key={idx}>
                {cols.map((c) => (
                  <td key={c}>{formatCellValue(row[c], c)}</td>
                ))}
                <td>{agentDisplay}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {commissionRate != null ? `${commissionRate}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function PaySourceSupplierDetail({
  sourceKey,
  label,
  selectedPeriod,
  dealsRevision,
}: {
  sourceKey: string;
  label: string;
  selectedPeriod: string;
  dealsRevision: number;
}) {
  const lines = paySourceVerifiedRows(sourceKey, selectedPeriod);
  const displayRows = useMemo(() => {
    return lines.map((line) => {
      const deal =
        getBmwDeals().find((d) => d.dealUid.trim().toLowerCase() === line.dealUid.trim().toLowerCase())
        ?? null;
      const dealAgentCommId = deal ? agentCommIdForDeal(deal, selectedPeriod) : '';
      const agentCommId = dealAgentCommId || deal?.agentCommId || '';
      const agentName = agentCommId
        ? displayAgentForCommission(agentCommId, selectedPeriod)
        : '—';
      const rawRate = agentCommId ? commissionRateForAgent(agentCommId, selectedPeriod) : null;
      const commissionRate =
        agentCommId && rawRate != null
          ? agentRateForCommissionPeriod(agentCommId, selectedPeriod, rawRate)
          : null;
      return { line, agentName, commissionRate };
    });
  }, [lines, selectedPeriod, dealsRevision]);

  if (!lines.length) {
    return (
      <p style={{ padding: 20, fontSize: 13, color: 'var(--gray)' }}>
        No verified deal lines for {formatPeriodLabel(selectedPeriod)}. Use <strong>Verify</strong> to assign deals to this deposit.
      </p>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
        {formatPeriodLabel(selectedPeriod)} · {lines.length} verified deals · {formatCommissionCurrency(lines.reduce((s, l) => s + l.amount, 0))}
      </div>
      <div className="comm-detail-scroll">
        <table className="admin-mini-table">
          <thead>
            <tr>
              <th>Deal UID</th>
              <th>Customer</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Agent</th>
              <th style={{ textAlign: 'right' }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(({ line, agentName, commissionRate }) => (
              <tr key={line.dealUid}>
                <td>{line.dealUid}</td>
                <td>{line.merchant}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {formatCommissionCurrency(line.amount)}
                </td>
                <td>{agentName}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {commissionRate != null ? `${commissionRate}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isCommissionLine(customer: AgentCommissionCustomer): boolean {
  return customer.lineKind !== 'expense' && customer.lineKind !== 'reconciliation';
}

function AgentPaymentExpenseCell({ customer }: { customer: AgentCommissionCustomer }) {
  if (customer.lineKind === 'expense') {
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--text)' }}>
          {customer.expenseAllocation ?? 'Expense'}
        </div>
      </div>
    );
  }

  if (customer.expenseDeduction && customer.expenseDeduction > 0.001) {
    return (
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>
          {formatCommissionCurrency(-customer.expenseDeduction)}
        </div>
        {customer.expenseAllocation && (
          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
            {customer.expenseAllocation}
          </div>
        )}
      </div>
    );
  }

  return <span style={{ color: 'var(--gray)' }}>—</span>;
}

function AgentPaymentReconciliationCell({ customer }: { customer: AgentCommissionCustomer }) {
  if (customer.lineKind === 'reconciliation') {
    return (
      <div style={{ fontSize: 12, color: 'var(--text)' }}>
        {customer.reconciliationAllocation ?? 'Reconciliation adjustment'}
      </div>
    );
  }

  if (customer.reconciliationDeduction && customer.reconciliationDeduction > 0.001) {
    return (
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 600 }}>
          {formatCommissionCurrency(-customer.reconciliationDeduction)}
        </div>
        {customer.reconciliationAllocation && (
          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
            {customer.reconciliationAllocation}
          </div>
        )}
      </div>
    );
  }

  return <span style={{ color: 'var(--gray)' }}>—</span>;
}

function AgentCustomerBreakdown({ customers }: { customers: AgentCommissionCustomer[] }) {
  const groups = useMemo(() => groupAgentCustomersBySupplier(customers), [customers]);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
          By commission partner
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {groups.map((group) => (
            <div
              key={group.supplier}
              style={{
                minWidth: 140,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--card)',
                border: '1px solid var(--gray-border)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)', marginBottom: 4 }}>
                {group.supplier}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15 }}>
                {formatCommissionCurrency(group.total)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                {group.customers.length} customer{group.customers.length === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
          Customers ({customers.length})
        </div>
        <table className="admin-mini-table comm-agent-payment-detail-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th style={{ textAlign: 'right' }}>Our payment</th>
              <th style={{ textAlign: 'right' }}>Rate</th>
              <th style={{ textAlign: 'right' }}>Gross residual</th>
              <th>Expense</th>
              <th>Reconciliation</th>
              <th style={{ textAlign: 'right' }}>Net residual</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.supplier}>
                <tr className="comm-agent-supplier-header-row">
                  <td colSpan={6} className="comm-agent-supplier-header-label">
                    {group.supplier}
                  </td>
                  <td className="comm-agent-supplier-header-total">
                    {formatCommissionCurrency(group.total)}
                  </td>
                </tr>
                {group.customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className={
                      customer.lineKind === 'expense'
                        ? 'comm-agent-expense-line'
                        : customer.lineKind === 'reconciliation'
                          ? 'comm-agent-reconciliation-line'
                          : undefined
                    }
                  >
                    <td style={{ paddingLeft: 20 }}>
                      <div style={{ fontWeight: customer.lineKind === 'expense' ? 600 : 400 }}>
                        {customer.company}
                      </div>
                      {customer.lineKind === 'reconciliation' && (
                        <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                          Supplier reconciliation
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {isCommissionLine(customer) && customer.sourceAmount != null
                        ? formatCommissionCurrency(customer.sourceAmount)
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {isCommissionLine(customer) ? `${customer.commissionRate}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {isCommissionLine(customer)
                        ? formatCommissionCurrency(customer.grossResidual ?? customer.amount)
                        : '—'}
                    </td>
                    <td>
                      <AgentPaymentExpenseCell customer={customer} />
                    </td>
                    <td>
                      <AgentPaymentReconciliationCell customer={customer} />
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {formatCommissionCurrency(customer.amount)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AgentsPanel({
  agents,
  period,
  imports,
  onRefresh,
  loading = false,
}: {
  agents: AgentCommissionRowView[];
  period: string;
  imports: SupplierImportBatch[];
  onRefresh: () => void;
  loading?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAgentPaymentsXlsx(period, imports, agents);
    } finally {
      setExporting(false);
    }
  };

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

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', padding: '8px 0 16px' }}>
          Loading deal master and agent rates…
        </p>
      ) : agents.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', padding: '8px 0 16px' }}>
          No agent commissions for {formatPeriodLabel(period)}. Import supplier reports with rep names
          (e.g. sales rep) or deal-master agent assignments.
        </p>
      ) : null}

      <div className="card">
        <div className="card-header assist-email-head">
          <div className="card-title">Agent payments — {formatPeriodLabel(period)}</div>
          <button
            type="button"
            className="admin-ticket-btn"
            disabled={exporting || agents.length === 0}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
        </div>
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
                            {agent.customers.length === 0 ? (
                              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No customer breakdown on file.</p>
                            ) : (
                              <AgentCustomerBreakdown customers={agent.customers} />
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
  const { ready: crmReady, bmwDeals, agentRates: crmAgentRates } = useCrmData();
  const dealMasterReady = crmReady && bmwDeals.length > 0 && crmAgentRates.length > 0;
  const [tab, setTab] = useState<CommissionsTab>('deposits');
  const [summaryImports, setSummaryImports] = useState<SupplierImportBatch[]>([]);
  const [detailImports, setDetailImports] = useState<SupplierImportBatch[]>([]);
  const [agents, setAgents] = useState<AgentCommissionRowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [supplierErrors, setSupplierErrors] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod());
  const [dealsRevision, setDealsRevision] = useState(0);
  const [depositTotals, setDepositTotals] = useState<Record<string, BankDepositPeriodTotal>>({});
  const [workflowRevision, setWorkflowRevision] = useState(0);
  const [expensesComplete, setExpensesCompleteFlag] = useState(false);
  const [adjustments, setAdjustments] = useState<SupplierPeriodAdjustment[]>([]);
  const [teamParticipants, setTeamParticipants] = useState<InternalCommissionParticipant[]>([]);
  const [dealSplitOverrides, setDealSplitOverrides] = useState<InternalDealSplit[]>([]);
  const [periodExpensesForWorkflow, setPeriodExpensesForWorkflow] = useState<CommissionExpenseRow[]>([]);
  const [teamRevision, setTeamRevision] = useState(0);
  const [reconcileFor, setReconcileFor] = useState<ReconcileModalState | null>(null);
  const [supplierPanelRevision, setSupplierPanelRevision] = useState(0);

  const refreshAdjustments = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/admin/supplier-reconciliation?period=${encodeURIComponent(selectedPeriod)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return false;
      const json = (await res.json()) as { adjustments?: SupplierPeriodAdjustment[] };
      setAdjustments(json.adjustments ?? []);
      return true;
    } catch {
      setAdjustments([]);
      return false;
    }
  }, [selectedPeriod]);

  const imports = useMemo(
    () => mergeCommissionImportBatches(summaryImports, detailImports),
    [summaryImports, detailImports],
  );

  const refreshSummaries = useCallback(async () => {
    const { batches, errors } = await fetchSupplierCommissions({ summariesOnly: true });
    setSummaryImports(mergeManualBatches(batches));
    setSupplierErrors(errors.map((e) => `${e.supplier}: ${e.message}`));
  }, []);

  const refreshPeriodDetail = useCallback(async () => {
    const periods = agentCommissionPeriods(selectedPeriod);
    const { batches, errors } = await fetchSupplierCommissions({ periods });
    setDetailImports(mergeManualBatches(batches));
    if (errors.length) {
      setSupplierErrors((prev) => {
        const next = new Set(prev);
        for (const e of errors) next.add(`${e.supplier}: ${e.message}`);
        return [...next];
      });
    }
  }, [selectedPeriod]);

  const trend = useMemo(() => commissionTrendSeries(imports), [imports]);
  const availablePeriods = useMemo(() => availableCommissionPeriods(imports), [imports]);
  const latestPeriod = availablePeriods[0] ?? currentPeriod();

  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (action === 'focus-deposits') setTab('deposits');
      else if (action === 'focus-suppliers') setTab('suppliers');
      else if (action === 'focus-expenses') setTab('expenses');
      else if (action === 'focus-agents') setTab('agents');
      else if (action === 'focus-team') setTab('team');
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

  const baseAgentRows = useMemo(() => {
    if (!dealMasterReady || !imports.length) return [];

    const runtime = getCrmRuntimeData();
    if (!runtime.bmwDeals.length && bmwDeals.length) {
      hydrateCrmRuntime({
        customers: runtime.customers,
        documentsByCustomerId: runtime.documentsByCustomerId,
        contractsByCustomerId: runtime.contractsByCustomerId,
        bmwDeals,
        agentRates: crmAgentRates,
        source: runtime.source,
      });
    }

    invalidateDealIndexes();
    rebuildAgentRateIndex();
    return getAgentCommissionRows({ imports, period: selectedPeriod });
  }, [dealMasterReady, imports, selectedPeriod, dealsRevision, bmwDeals, crmAgentRates]);

  const refreshAgents = useCallback(async () => {
    if (!dealMasterReady) {
      setAgents([]);
      return;
    }
    let periodExpenses: CommissionExpenseRow[] = [];
    try {
      const res = await fetch(
        `/api/admin/expenses?period=${encodeURIComponent(selectedPeriod)}&latestPeriod=${encodeURIComponent(latestPeriod)}`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const json = (await res.json()) as { expenses?: CommissionExpenseRow[] };
        periodExpenses = json.expenses ?? [];
      }
    } catch {
      /* agent rows still load without expense deductions */
    }
    setPeriodExpensesForWorkflow(periodExpenses);
    setAgents(
      applyReconciliationToAgentRows(
        applyExpenseDeductionsToAgentRows(baseAgentRows, periodExpenses, crmAgentRates),
        adjustments,
        selectedPeriod,
        crmAgentRates,
      ),
    );
  }, [baseAgentRows, dealMasterReady, selectedPeriod, latestPeriod, crmAgentRates, adjustments]);

  const refreshTeamParticipants = useCallback(async () => {
    try {
      const [participantsRes, splitsRes] = await Promise.all([
        fetch('/api/admin/team-participants', { cache: 'no-store' }),
        fetch('/api/admin/deal-splits', { cache: 'no-store' }),
      ]);
      if (participantsRes.ok) {
        const json = (await participantsRes.json()) as { participants?: InternalCommissionParticipant[] };
        setTeamParticipants(json.participants ?? []);
      }
      if (splitsRes.ok) {
        const json = (await splitsRes.json()) as { splits?: InternalDealSplit[] };
        setDealSplitOverrides(json.splits ?? []);
      }
    } catch {
      setTeamParticipants([]);
      setDealSplitOverrides([]);
    }
    setTeamRevision((r) => r + 1);
  }, []);

  const teamPayoutWorkflowRows = useMemo(() => {
    if (!dealMasterReady || !imports.length) return [];
    const base = buildTeamPayoutRows(imports, selectedPeriod, teamParticipants, dealSplitOverrides);
    const afterExpenses = applyExpenseAdjustmentsToTeamRows(base, periodExpensesForWorkflow);
    const afterReconciliation = applyReconciliationToTeamRows(
      afterExpenses,
      adjustments,
      selectedPeriod,
      teamParticipants,
    );
    return attachTeamPayoutPaidState(afterReconciliation, selectedPeriod).map((r) => ({
      profileId: r.profileId,
      currentMonthOwed: r.currentMonthOwed,
      paid: r.paid,
    }));
  }, [
    dealMasterReady,
    imports,
    selectedPeriod,
    teamParticipants,
    dealSplitOverrides,
    teamRevision,
    periodExpensesForWorkflow,
    adjustments,
  ]);

  const refreshSuppliers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      try {
        await syncLocalManualImportsToServer();
      } catch {
        /* ignore until migration is applied or when local storage is empty */
      }
      await refreshSummaries();
    } catch (err) {
      setSupplierErrors([]);
      setLoadError(
        err instanceof Error ? err.message : 'Could not load supplier commissions from the database.',
      );
    } finally {
      setLoading(false);
    }
  }, [refreshSummaries]);

  useEffect(() => {
    void refreshPeriodDetail();
  }, [selectedPeriod, refreshPeriodDetail]);

  useEffect(() => {
    void syncAgentProfilesFromServer().catch(() => {
      /* table may not exist until migration is applied */
    });
  }, []);

  useEffect(() => {
    void refreshAdjustments();
  }, [refreshAdjustments]);

  useEffect(() => {
    void refreshSuppliers();
  }, [refreshSuppliers]);

  useEffect(() => {
    void refreshTeamParticipants();
  }, [refreshTeamParticipants]);

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  useEffect(() => {
    if (!dealMasterReady) return;
    invalidateDealIndexes();
    rebuildAgentRateIndex();
    setDealsRevision((r) => r + 1);
  }, [dealMasterReady]);

  useEffect(() => {
    invalidateDealIndexes();
    rebuildAgentRateIndex();
  }, [dealsRevision]);

  useEffect(() => {
    const onUpdate = () => {
      void refreshSummaries();
      void refreshPeriodDetail();
      void refreshAdjustments();
      if (dealMasterReady) void refreshAgents();
      void refreshTeamParticipants();
      setDealsRevision((r) => r + 1);
      setWorkflowRevision((r) => r + 1);
      setExpensesCompleteFlag(readExpensesComplete(selectedPeriod));
    };
    const onCrmHydrated = () => {
      invalidateDealIndexes();
      rebuildAgentRateIndex();
      setDealsRevision((r) => r + 1);
    };
    window.addEventListener('candid-commissions-updated', onUpdate);
    window.addEventListener('candid-crm-hydrated', onCrmHydrated);
    return () => {
      window.removeEventListener('candid-commissions-updated', onUpdate);
      window.removeEventListener('candid-crm-hydrated', onCrmHydrated);
    };
  }, [refreshAgents, refreshSummaries, refreshPeriodDetail, refreshAdjustments, refreshTeamParticipants, selectedPeriod, dealMasterReady]);

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
        adjustments={adjustments}
        teamPayouts={teamPayoutWorkflowRows}
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
            adjustments={adjustments}
            agentRates={crmAgentRates}
            onAdjustmentsRefresh={refreshAdjustments}
            onOpenReconcile={(state) => {
            void refreshTeamParticipants();
            setReconcileFor(state);
          }}
            dataRevision={supplierPanelRevision}
          />
        )
      ) : tab === 'expenses' ? (
        <ExpensesPanel period={selectedPeriod} latestPeriod={latestPeriod} />
      ) : tab === 'team' ? (
        <TeamPayoutsPanel
          period={selectedPeriod}
          latestPeriod={latestPeriod}
          imports={imports}
          participants={teamParticipants}
          dealSplitOverrides={dealSplitOverrides}
          adjustments={adjustments}
          loading={!dealMasterReady || loading}
          onRefresh={() => {
            void refreshTeamParticipants();
            setTeamRevision((r) => r + 1);
            setWorkflowRevision((r) => r + 1);
          }}
        />
      ) : (
        <AgentsPanel
          agents={agents}
          period={selectedPeriod}
          imports={imports}
          onRefresh={refreshAgents}
          loading={!dealMasterReady || loading}
        />
      )}
      {reconcileFor && (
        <ReconcileVarianceModal
          key={`${reconcileFor.supplierId}-${selectedPeriod}-${reconcileFor.existingAdjustment?.id ?? 'new'}`}
          supplierId={reconcileFor.supplierId}
          period={selectedPeriod}
          importTotal={reconcileFor.importTotal}
          depositTotal={reconcileFor.depositTotal}
          variance={reconcileFor.variance}
          existingAdjustment={reconcileFor.existingAdjustment}
          agentRates={crmAgentRates}
          internalParticipants={teamParticipants}
          imports={imports}
          onClose={() => setReconcileFor(null)}
          onSaved={async () => {
            const refreshed = await refreshAdjustments();
            if (!refreshed) {
              throw new Error('Reconciliation saved but the list could not be refreshed. Reload the page.');
            }
            setSupplierPanelRevision((v) => v + 1);
            setWorkflowRevision((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

export default CommissionsView;
