'use client';

import { useMemo, useState } from 'react';
import { resolveAgentDisplayName } from '@/lib/bmw/deal-master';
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

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
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
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [lines, setLines] = useState<VerifyDealLine[]>(() =>
    buildVerifyDealLines(sourceLabel, imports, supplierId, false),
  );
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

  const selectedTotal = useMemo(
    () => roundMoney(lines.filter((l) => l.selected).reduce((s, l) => s + l.amount, 0)),
    [lines],
  );

  const remainder = roundMoney(depositAmount - selectedTotal);
  const canMatch = Math.abs(remainder) < 0.01 && lines.some((l) => l.selected);

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
                ? (line.lastKnownAmount ?? (lines.length === 1 ? depositAmount : 0))
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

  const handleMatch = () => {
    setError(null);
    const picked = lines.filter((l) => l.selected && l.amount > 0);
    if (!picked.length) {
      setError('Select at least one deal and enter commission amounts.');
      return;
    }
    setSaving(true);
    try {
      persistVerifiedMatch({
        supplierId,
        sourceKey,
        sourceLabel,
        period,
        depositAmount,
        lines: picked.map((l) => ({
          dealUid: l.deal.dealUid,
          merchant: l.deal.merchant,
          amount: roundMoney(l.amount),
        })),
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
        style={{ width: 'min(720px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Verify commissions — {title}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16 }}>
            No commission report is on file for {formatPeriodLabel(period)}. Match active deals
            to the bank deposit of{' '}
            <strong>{formatCommissionCurrency(depositAmount)}</strong>.
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>
              Deals ({visibleLines.length})
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray)' }}>
              <input
                type="checkbox"
                checked={showAllDeals}
                onChange={(e) => setShowAllDeals(e.target.checked)}
              />
              Show inactive deals
            </label>
          </div>

          {visibleLines.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>
              No deals found for this pay source. Add the deal in BMW master or Partners first.
            </p>
          ) : (
            <table className="admin-mini-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>Deal UID</th>
                  <th>Merchant</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((line) => (
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
                      {line.deal.agentCommId
                        ? resolveAgentDisplayName(line.deal.agentCommId)
                        : '—'}
                    </td>
                    <td style={{ fontSize: 11, fontWeight: 600, color: line.deal.activeDeal ? 'var(--green)' : 'var(--gray)' }}>
                      {line.deal.activeDeal ? 'Active' : 'Inactive'}
                    </td>
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
                      {line.lastKnownAmount != null && (
                        <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>
                          Last: {formatCommissionCurrency(line.lastKnownAmount)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
