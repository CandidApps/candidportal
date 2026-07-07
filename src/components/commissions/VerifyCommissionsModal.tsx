'use client';

import { useMemo, useState } from 'react';
import { resolveAgentDisplayName, getBmwAgentRates } from '@/lib/bmw/deal-master';
import { agentCommIdForDeal, commissionRateForAgent } from '@/lib/bmw/agent-comm-history';
import { getAddedDeal, type CommissionDealType } from '@/lib/bmw/added-deals';
import type { BmwDeal } from '@/lib/bmw/types';
import {
  formatCommissionCurrency,
  formatPeriodLabel,
} from '@/lib/commissions/commission-store';
import {
  SUPPLIER_LABELS,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import {
  buildVerifyDealLines,
  findDepositMatchSuggestions,
  persistVerifiedMatch,
  type VerifyDealLine,
} from '@/lib/commissions/verify-commissions';
import {
  CommissionDealForm,
  CommissionDealRowFields,
  agentNameForId,
  agentRateForId,
} from '@/components/commissions/CommissionDealForm';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function agentRateForVerifyLine(
  deal: BmwDeal,
  supplierId: SupplierId | null,
  period: string,
): number | null {
  const added = supplierId ? getAddedDeal(supplierId, deal.dealUid) : undefined;
  const agentCommId = agentCommIdForDeal(deal, period);
  if (added) return added.commissionRate;
  if (agentCommId) return commissionRateForAgent(agentCommId, period);
  return null;
}

type CustomVerifyLine = {
  id: string;
  dealUid: string;
  merchant: string;
  agentCommId: string;
  commissionType: CommissionDealType;
  amount: number;
  selected: boolean;
};

function newCustomLine(depositAmount: number, existingCount: number): CustomVerifyLine {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dealUid: '',
    merchant: '',
    agentCommId: '',
    commissionType: 'recurring',
    amount: existingCount === 0 ? depositAmount : 0,
    selected: true,
  };
}

export function VerifyCommissionsModal({
  sourceLabel,
  sourceKey,
  supplierId,
  period,
  depositAmount,
  imports,
  onClose,
  onSaved,
}: {
  sourceLabel: string;
  sourceKey: string;
  supplierId: SupplierId | null;
  period: string;
  depositAmount: number;
  imports: SupplierImportBatch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const agents = useMemo(() => getBmwAgentRates().slice().sort((a, b) => a.name.localeCompare(b.name)), []);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [lines, setLines] = useState<VerifyDealLine[]>(() =>
    buildVerifyDealLines(sourceLabel, imports, supplierId, false),
  );
  const [customLines, setCustomLines] = useState<CustomVerifyLine[]>([]);
  const [showAddDealForm, setShowAddDealForm] = useState(false);
  const [saveNewDeals, setSaveNewDeals] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const visibleLines = useMemo(() => {
    if (showAllDeals) return lines;
    const active = lines.filter((l) => l.deal.activeDeal);
    return active.length ? active : lines;
  }, [lines, showAllDeals]);

  const suggestions = useMemo(
    () => findDepositMatchSuggestions(lines, depositAmount),
    [lines, depositAmount],
  );

  const selectedTotal = useMemo(() => {
    const fromDeals = lines.filter((l) => l.selected).reduce((s, l) => s + l.amount, 0);
    const fromCustom = customLines.filter((l) => l.selected).reduce((s, l) => s + l.amount, 0);
    return roundMoney(fromDeals + fromCustom);
  }, [lines, customLines]);

  const remainder = roundMoney(depositAmount - selectedTotal);
  const canMatch = Math.abs(remainder) < 0.01
    && (lines.some((l) => l.selected) || customLines.some((l) => l.selected));

  const applySuggestion = (amounts: Map<string, number>) => {
    setLines((prev) =>
      prev.map((line) => {
        const uid = line.deal.dealUid;
        if (!amounts.has(uid)) {
          return { ...line, selected: false, amount: line.lastKnownAmount ?? 0 };
        }
        return { ...line, selected: true, amount: amounts.get(uid)! };
      }),
    );
  };

  const toggleLine = (dealUid: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.deal.dealUid === dealUid
          ? {
              ...line,
              selected: !line.selected,
              amount: !line.selected && line.amount === 0
                ? (line.lastKnownAmount ?? (lines.length === 1 && !customLines.length ? depositAmount : 0))
                : line.amount,
            }
          : line,
      ),
    );
  };

  const setAmount = (dealUid: string, raw: string) => {
    const n = Number(raw.replace(/[^0-9.-]/g, ''));
    setLines((prev) =>
      prev.map((line) =>
        line.deal.dealUid === dealUid
          ? { ...line, amount: Number.isFinite(n) ? n : 0, selected: true }
          : line,
      ),
    );
  };

  const updateCustomLine = (id: string, patch: Partial<CustomVerifyLine>) => {
    setCustomLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleMatch = async () => {
    setError(null);
    const pickedDeals = lines.filter((l) => l.selected && l.amount > 0);
    const pickedCustom = customLines.filter((l) => l.selected && l.amount > 0);

    for (const row of pickedCustom) {
      if (!row.dealUid.trim() || !row.merchant.trim()) {
        setError('Each new row needs a deal UID and merchant name.');
        return;
      }
      if (!row.agentCommId) {
        setError('Each new row needs an agent selected.');
        return;
      }
    }

    const allPicked = [
      ...pickedDeals.map((l) => ({
        dealUid: l.deal.dealUid,
        merchant: l.deal.merchant,
        amount: roundMoney(l.amount),
      })),
      ...pickedCustom.map((l) => ({
        dealUid: l.dealUid.trim(),
        merchant: l.merchant.trim(),
        amount: roundMoney(l.amount),
      })),
    ];

    if (!allPicked.length) {
      setError('Select at least one deal and enter commission amounts.');
      return;
    }

    const dealMeta: Record<string, {
      agentCommId: string;
      agentName: string;
      commissionRate: number;
      commissionType?: CommissionDealType;
    }> = {};

    if (saveNewDeals && pickedCustom.length) {
      for (const row of pickedCustom) {
        dealMeta[row.dealUid.trim()] = {
          agentCommId: row.agentCommId,
          agentName: agentNameForId(agents, row.agentCommId),
          commissionRate: agentRateForId(agents, row.agentCommId),
          commissionType: row.commissionType,
        };
      }
    }

    setSaving(true);
    try {
      await persistVerifiedMatch({
        supplierId,
        sourceKey,
        sourceLabel,
        period,
        depositAmount,
        lines: allPicked,
        saveLinesAsDeals: saveNewDeals && pickedCustom.length > 0,
        dealMeta,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save match');
    } finally {
      setSaving(false);
    }
  };

  const title = supplierId ? SUPPLIER_LABELS[supplierId] : sourceLabel;

  return (
    <div className="modal-overlay open bank-classify-overlay" onClick={onClose}>
      <div
        className="modal-box bank-classify-modal"
        style={{ width: 'min(820px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Verify commissions — {title}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16 }}>
            Match deals to the bank deposit of{' '}
            <strong>{formatCommissionCurrency(depositAmount)}</strong> for{' '}
            {formatPeriodLabel(period)}. Add new rows for merchants not in the deal master yet.
          </p>

          {suggestions.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
                Suggested matches
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {suggestions.map((s) => {
                  const amountMap = new Map(s.lines.map((l) => [l.dealUid, l.amount]));
                  const sum = s.lines.reduce((n, l) => n + l.amount, 0);
                  return (
                    <button
                      key={s.label}
                      type="button"
                      className="admin-ticket-btn"
                      style={{ textAlign: 'left', justifyContent: 'space-between', display: 'flex' }}
                      onClick={() => applySuggestion(amountMap)}
                    >
                      <span>{s.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {formatCommissionCurrency(sum)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>
              Deals ({visibleLines.length + customLines.length})
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray)' }}>
                <input
                  type="checkbox"
                  checked={showAllDeals}
                  onChange={(e) => setShowAllDeals(e.target.checked)}
                />
                Show inactive deals
              </label>
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => setCustomLines((prev) => [...prev, newCustomLine(depositAmount, prev.length + lines.length)])}
              >
                Add row
              </button>
              <button
                type="button"
                className="admin-ticket-btn"
                onClick={() => setShowAddDealForm((v) => !v)}
              >
                {showAddDealForm ? 'Hide form' : 'Add deal'}
              </button>
            </div>
          </div>

          {showAddDealForm && (
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--gray-light)', borderRadius: 8 }}>
              <CommissionDealForm
                supplier={supplierId ?? undefined}
                paySource={supplierId ? undefined : sourceLabel}
                submitLabel="Save deal"
                onSaved={() => {
                  setLines(buildVerifyDealLines(sourceLabel, imports, supplierId, false));
                  setShowAddDealForm(false);
                }}
                onCancel={() => setShowAddDealForm(false)}
              />
              <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 12 }}>
                Saving here stores the deal for future months. Use <strong>Add row</strong> above to
                enter amounts for this deposit without saving the deal separately first.
              </p>
            </div>
          )}

          {(visibleLines.length > 0 || customLines.length > 0) ? (
            <table className="admin-mini-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>Deal UID</th>
                  <th>Merchant</th>
                  <th>Agent</th>
                  <th style={{ textAlign: 'right', width: 72 }}>Agent %</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((line) => {
                  const agentCommId = agentCommIdForDeal(line.deal, period);
                  const agentRate = agentRateForVerifyLine(line.deal, supplierId, period);
                  return (
                  <tr key={line.deal.dealUid}>
                    <td>
                      <input
                        type="checkbox"
                        checked={lines.find((l) => l.deal.dealUid === line.deal.dealUid)?.selected ?? false}
                        onChange={() => toggleLine(line.deal.dealUid)}
                      />
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{line.deal.dealUid}</td>
                    <td style={{ fontSize: 13 }}>{line.deal.merchant}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray)' }}>
                      {agentCommId ? resolveAgentDisplayName(agentCommId) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {agentRate != null ? `${agentRate}%` : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--gray)' }}>Existing</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={lines.find((l) => l.deal.dealUid === line.deal.dealUid)?.amount || ''}
                        onChange={(e) => setAmount(line.deal.dealUid, e.target.value)}
                        placeholder={line.lastKnownAmount != null ? String(line.lastKnownAmount) : '0'}
                        style={{
                          width: 100,
                          textAlign: 'right',
                          border: '1px solid var(--gray-border)',
                          borderRadius: 4,
                          padding: '4px 8px',
                          fontSize: 12,
                          fontFamily: 'var(--font-mono)',
                        }}
                      />
                    </td>
                  </tr>
                  );
                })}
                {customLines.map((row) => (
                  <tr key={row.id} style={{ background: 'rgba(99,102,241,0.04)' }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => updateCustomLine(row.id, { selected: !row.selected })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.dealUid}
                        onChange={(e) => updateCustomLine(row.id, { dealUid: e.target.value })}
                        placeholder="Deal UID"
                        style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.merchant}
                        onChange={(e) => updateCustomLine(row.id, { merchant: e.target.value })}
                        placeholder="Merchant"
                        style={{ width: '100%', fontSize: 12 }}
                      />
                    </td>
                    <td>
                      <CommissionDealRowFields
                        agentCommId={row.agentCommId}
                        commissionType={row.commissionType}
                        agents={agents}
                        onAgentChange={(id) => updateCustomLine(row.id, { agentCommId: id })}
                        onTypeChange={(type) => updateCustomLine(row.id, { commissionType: type })}
                        fields="agent"
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {row.agentCommId ? `${agentRateForId(agents, row.agentCommId)}%` : '—'}
                    </td>
                    <td>
                      <CommissionDealRowFields
                        agentCommId={row.agentCommId}
                        commissionType={row.commissionType}
                        agents={agents}
                        onAgentChange={(id) => updateCustomLine(row.id, { agentCommId: id })}
                        onTypeChange={(type) => updateCustomLine(row.id, { commissionType: type })}
                        fields="type"
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={row.amount || ''}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/[^0-9.-]/g, ''));
                          updateCustomLine(row.id, { amount: Number.isFinite(n) ? n : 0, selected: true });
                        }}
                        style={{
                          width: 100,
                          textAlign: 'right',
                          border: '1px solid var(--gray-border)',
                          borderRadius: 4,
                          padding: '4px 8px',
                          fontSize: 12,
                          fontFamily: 'var(--font-mono)',
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 12 }}>
              No deals found for this pay source. Add a row or use the form above to create deals
              for merchants like Linked2Pay accounts.
            </p>
          )}

          {customLines.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={saveNewDeals}
                onChange={(e) => setSaveNewDeals(e.target.checked)}
              />
              Save new rows as deals for future matching
            </label>
          )}

          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              background: 'var(--gray-light)',
              borderRadius: 8,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
            }}
          >
            <span>
              Selected total:{' '}
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {formatCommissionCurrency(selectedTotal)}
              </strong>
            </span>
            <span style={{ color: Math.abs(remainder) < 0.01 ? 'var(--green)' : 'var(--amber)' }}>
              {Math.abs(remainder) < 0.01
                ? 'Matches deposit'
                : `${remainder > 0 ? 'Remaining' : 'Over by'} ${formatCommissionCurrency(Math.abs(remainder))}`}
            </span>
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            padding: '16px 28px',
            borderTop: '1px solid var(--gray-border)',
          }}
        >
          <button type="button" className="admin-ticket-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-ticket-btn primary"
            disabled={!canMatch || saving}
            onClick={handleMatch}
          >
            {saving ? 'Saving…' : 'Match to deposit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerifyCommissionsModal;
