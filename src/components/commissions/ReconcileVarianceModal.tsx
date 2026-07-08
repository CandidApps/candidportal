'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatCommissionCurrency,
  formatPeriodLabel,
} from '@/lib/commissions/commission-store';
import {
  agentsWithPayoutOnSupplier,
  buildSupplementalReconcileParticipants,
  listSelectableAgents,
  RECONCILIATION_TOLERANCE,
  RESOLUTION_LABELS,
  type ReconciliationResolutionType,
  type SelectableAgent,
  type SupplierPeriodAdjustment,
  OVERAGE_RESOLUTIONS,
  SHORTFALL_RESOLUTIONS,
} from '@/lib/commissions/supplier-reconciliation';
import {
  SUPPLIER_LABELS,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import type { BmwAgentRate } from '@/lib/bmw/types';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateSaveInput(input: {
  note: string;
  adjustmentAmount: number;
  existingAdjustment: SupplierPeriodAdjustment | null;
  needsSingleAgent: boolean;
  needsMultiAgent: boolean;
  selectedAgentCount: number;
}): string | null {
  if (!input.note.trim()) return 'Add a note explaining this reconciliation.';
  if (
    Math.abs(input.adjustmentAmount) <= RECONCILIATION_TOLERANCE
    && !input.existingAdjustment
  ) {
    return 'Variance is already within tolerance — nothing to reconcile.';
  }
  if (input.needsSingleAgent && input.selectedAgentCount !== 1) {
    return 'Select exactly one agent or partner.';
  }
  if (input.needsMultiAgent && input.selectedAgentCount < 1) {
    return 'Select at least one agent or partner for the split.';
  }
  return null;
}

export function ReconcileVarianceModal({
  supplierId,
  period,
  importTotal,
  depositTotal,
  variance,
  existingAdjustment,
  agentRates,
  internalParticipants,
  imports,
  onClose,
  onSaved,
}: {
  supplierId: SupplierId;
  period: string;
  importTotal: number;
  depositTotal: number;
  variance: number;
  existingAdjustment: SupplierPeriodAdjustment | null;
  agentRates: BmwAgentRate[];
  internalParticipants: InternalCommissionParticipant[];
  imports: SupplierImportBatch[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const adjustmentAmount = roundMoney(existingAdjustment?.amount ?? variance);
  const isShortfall = adjustmentAmount < -RECONCILIATION_TOLERANCE;
  const resolutionOptions = isShortfall ? SHORTFALL_RESOLUTIONS : OVERAGE_RESOLUTIONS;

  const [resolutionType, setResolutionType] = useState<ReconciliationResolutionType>(
    () =>
      existingAdjustment?.resolutionType
      ?? (adjustmentAmount < -RECONCILIATION_TOLERANCE
        ? SHORTFALL_RESOLUTIONS[0]!
        : OVERAGE_RESOLUTIONS[0]!),
  );
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    () => new Set(existingAdjustment?.agentMergeKeys ?? []),
  );
  const [showOnAgentReport, setShowOnAgentReport] = useState(
    existingAdjustment?.showOnAgentReport ?? true,
  );
  const [note, setNote] = useState(existingAdjustment?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectableAgents, setSelectableAgents] = useState<SelectableAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAgentsLoading(true);

    const loadAgents = () => {
      if (cancelled) return;
      try {
        const payingMergeKeys = agentsWithPayoutOnSupplier(imports, supplierId, period);
        setSelectableAgents(
          listSelectableAgents(agentRates, supplierId, period, {
            payingMergeKeys,
            supplementalAgents: buildSupplementalReconcileParticipants(
              internalParticipants,
              agentRates,
            ),
          }),
        );
      } catch {
        setSelectableAgents([]);
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    };

    if (window.requestIdleCallback) {
      const idleId = window.requestIdleCallback(loadAgents, { timeout: 250 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timer = window.setTimeout(loadAgents, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [agentRates, internalParticipants, imports, supplierId, period]);

  const reconciledTotal = roundMoney(importTotal + adjustmentAmount);
  const needsSingleAgent =
    resolutionType === 'agent_charge' || resolutionType === 'agent_bonus';
  const needsMultiAgent = resolutionType === 'agent_pro_rata';

  const perAgentShare = useMemo(() => {
    if (!needsMultiAgent || selectedAgents.size === 0) return 0;
    return roundMoney(Math.abs(adjustmentAmount) / selectedAgents.size);
  }, [needsMultiAgent, selectedAgents.size, adjustmentAmount]);

  const toggleAgent = (mergeKey: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (needsSingleAgent) {
        next.clear();
        next.add(mergeKey);
      } else if (next.has(mergeKey)) {
        next.delete(mergeKey);
      } else {
        next.add(mergeKey);
      }
      return next;
    });
  };

  const saveValidationError = validateSaveInput({
    note,
    adjustmentAmount,
    existingAdjustment,
    needsSingleAgent,
    needsMultiAgent,
    selectedAgentCount: selectedAgents.size,
  });

  const handleSave = async () => {
    const validationError = validateSaveInput({
      note,
      adjustmentAmount,
      existingAdjustment,
      needsSingleAgent,
      needsMultiAgent,
      selectedAgentCount: selectedAgents.size,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    const allowedResolutions = isShortfall ? SHORTFALL_RESOLUTIONS : OVERAGE_RESOLUTIONS;
    if (!allowedResolutions.includes(resolutionType)) {
      setError(
        isShortfall
          ? 'Choose a shortfall resolution (absorb, charge agent, or split).'
          : 'Choose an overage resolution (Candid revenue or agent bonus).',
      );
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/supplier-reconciliation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existingAdjustment?.id,
          supplierId,
          period,
          amount: adjustmentAmount,
          resolutionType,
          agentMergeKeys: [...selectedAgents],
          showOnAgentReport:
            resolutionType === 'agent_charge' || resolutionType === 'agent_bonus'
              ? showOnAgentReport
              : false,
          note: note.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Could not save reconciliation');
      await onSaved();
      window.dispatchEvent(new Event('candid-commissions-updated'));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save reconciliation');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/admin/supplier-reconciliation?supplierId=${encodeURIComponent(supplierId)}&period=${encodeURIComponent(period)}`,
        { method: 'DELETE' },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Could not remove reconciliation');
      await onSaved();
      window.dispatchEvent(new Event('candid-commissions-updated'));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove reconciliation');
    } finally {
      setRemoving(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="modal-overlay open bank-classify-overlay"
      style={{ zIndex: 800 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-box bank-classify-modal"
        style={{ width: 'min(760px, 95vw)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Reconcile variance</div>
            <div style={{ fontSize: 13, color: 'var(--gray)', marginTop: 4 }}>
              {SUPPLIER_LABELS[supplierId]} · {formatPeriodLabel(period)}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body" style={{ display: 'grid', gap: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              padding: 14,
              background: 'var(--gray-light)',
              borderRadius: 8,
            }}
          >
            <Stat label="Report total" value={formatCommissionCurrency(importTotal)} />
            <Stat label="Deposit" value={formatCommissionCurrency(depositTotal)} />
            <Stat
              label="Variance"
              value={`${adjustmentAmount > 0 ? '+' : '−'}${formatCommissionCurrency(Math.abs(adjustmentAmount))}`}
              tone={adjustmentAmount > 0 ? 'over' : 'under'}
            />
            <Stat label="After reconcile" value={formatCommissionCurrency(reconciledTotal)} />
          </div>

          <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0, lineHeight: 1.55 }}>
            {isShortfall
              ? 'Deposit is below the report total. Choose how to close the remaining gap — this will not change imported report rows.'
              : 'Deposit exceeds the report total. Choose where the extra amount goes.'}
          </p>

          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
              Resolution
            </legend>
            <div style={{ display: 'grid', gap: 8 }}>
              {resolutionOptions.map((type) => (
                <label
                  key={type}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    border: `1px solid ${resolutionType === type ? 'var(--navy)' : 'var(--border)'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: resolutionType === type ? 'rgba(26,54,93,0.04)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="resolution"
                    checked={resolutionType === type}
                    onChange={() => {
                      setResolutionType(type);
                      if (type !== 'agent_pro_rata' && type !== 'agent_charge' && type !== 'agent_bonus') {
                        setSelectedAgents(new Set());
                      }
                    }}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>{RESOLUTION_LABELS[type]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {(needsSingleAgent || needsMultiAgent) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
                {needsSingleAgent ? 'Select agent or partner' : 'Select agents/partners for split'}
              </div>
              <p style={{ fontSize: 12, color: 'var(--gray)', margin: '0 0 10px', lineHeight: 1.45 }}>
                BMW deal-master agents plus everyone active on the commission team (partners and internal employees).
                {needsMultiAgent && selectedAgents.size > 0 && (
                  <> Split equally: {formatCommissionCurrency(perAgentShare)} each.</>
                )}
              </p>
              <div
                style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                {agentsLoading ? (
                  <p style={{ fontSize: 12, color: 'var(--gray)', padding: 12, margin: 0 }}>
                    Loading agents…
                  </p>
                ) : (
                  selectableAgents.map((agent) => {
                  const checked = selectedAgents.has(agent.mergeKey);
                  return (
                    <label
                      key={agent.mergeKey}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: checked ? 'rgba(26,54,93,0.04)' : 'transparent',
                      }}
                    >
                      <input
                        type={needsSingleAgent ? 'radio' : 'checkbox'}
                        name="recon-agent"
                        checked={checked}
                        onChange={() => toggleAgent(agent.mergeKey)}
                      />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{agent.displayName}</span>
                      {agent.role === 'partner' ? (
                        <span className="admin-status-pill" style={{ fontSize: 10 }}>
                          Partner
                        </span>
                      ) : agent.role === 'internal' ? (
                        <span className="admin-status-pill" style={{ fontSize: 10 }}>
                          Internal
                        </span>
                      ) : null}
                      {agent.hasPayoutOnSupplier ? (
                        <span className="admin-status-pill admin-status-pill--resolved" style={{ fontSize: 10 }}>
                          Paying this period
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--gray)' }}>Not on report</span>
                      )}
                    </label>
                  );
                })
                )}
              </div>
            </div>
          )}

          {(resolutionType === 'agent_charge' || resolutionType === 'agent_bonus') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={showOnAgentReport}
                onChange={(e) => setShowOnAgentReport(e.target.checked)}
              />
              Show as line item on agent commission report
            </label>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 6 }}>
              Note (required)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Device purchase reimbursed directly — deduct from Bryan Willis"
              style={{ width: '100%', fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}
            />
          </div>

          {saveValidationError && !error && (
            <p style={{ fontSize: 13, color: 'var(--amber)', margin: 0 }}>
              {saveValidationError}
            </p>
          )}

          {error && (
            <p style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{error}</p>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            {existingAdjustment && (
              <button
                type="button"
                className="btn-secondary"
                style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                disabled={removing || saving}
                onClick={() => void handleRemove()}
              >
                {removing ? 'Removing…' : 'Remove reconciliation'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save reconciliation'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'over' | 'under';
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          marginTop: 4,
          fontFamily: 'var(--font-mono)',
          color: tone === 'over' ? 'var(--green)' : tone === 'under' ? 'var(--red)' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
