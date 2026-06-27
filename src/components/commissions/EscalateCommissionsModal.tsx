'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatCommissionCurrency,
  formatPeriodLabel,
} from '@/lib/commissions/commission-store';
import {
  buildEscalationEmailBody,
  buildEscalationLines,
  excludeSupplierPayout,
  findPartnerForPaySource,
  findPartnerForSupplier,
  paySourceLabelForSupplier,
  type EscalationLine,
} from '@/lib/commissions/escalate-commissions';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import type { PartnerSupplierRecord } from '@/lib/bank-deposits/source-match';
import { fetchPartnerSuppliers } from '@/lib/services/bank-deposits';
import {
  SUPPLIER_LABELS,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';

export function EscalateCommissionsModal({
  supplierId,
  period,
  commissionTotal,
  depositTotal,
  imports,
  onClose,
  onExcluded,
}: {
  supplierId: SupplierId;
  period: string;
  commissionTotal: number;
  depositTotal: number;
  imports: SupplierImportBatch[];
  onClose: () => void;
  onExcluded: () => void;
}) {
  const [partners, setPartners] = useState<PartnerSupplierRecord[]>([]);
  const [excluding, setExcluding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchPartnerSuppliers().then(setPartners).catch(() => setPartners([]));
  }, []);

  const lines = useMemo(
    () => buildEscalationLines(supplierId, period, imports),
    [supplierId, period, imports],
  );

  const shortfall = Math.round((commissionTotal - depositTotal) * 100) / 100;
  const agentPayoutTotal = useMemo(
    () => Math.round(lines.reduce((s, l) => s + l.agentPayout, 0) * 100) / 100,
    [lines],
  );

  const supplierLabel = SUPPLIER_LABELS[supplierId];
  const paySourceLabel = paySourceLabelForSupplier(supplierId);
  const periodLabel = formatPeriodLabel(period);

  const supplierPartner = findPartnerForSupplier(partners, supplierId);
  const paySourcePartner = findPartnerForPaySource(partners, paySourceLabel);

  const emailContent = buildEscalationEmailBody({
    supplierLabel,
    paySourceLabel,
    periodLabel,
    commissionTotal,
    depositTotal,
    shortfall,
    lines,
  });

  const openEmail = (email: string | null | undefined, label: string) => {
    if (!email?.trim()) {
      setError(`No contact email on file for ${label}. Add one under Suppliers → Partners.`);
      return;
    }
    setError(null);
    launchAdminZohoCompose({
      to: email.trim(),
      subject: emailContent.subject,
      body: emailContent.body,
      contextLabel: label,
    });
  };

  const handleExclude = () => {
    setError(null);
    setExcluding(true);
    try {
      const dealUids = lines.filter((l) => l.dealUid).map((l) => l.dealUid);
      excludeSupplierPayout({
        supplierId,
        period,
        dealUids,
        commissionTotal,
        depositTotal,
        shortfall,
        excludedAt: new Date().toISOString(),
      });
      onExcluded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not exclude payout');
    } finally {
      setExcluding(false);
    }
  };

  return (
    <div className="modal-overlay open bank-classify-overlay" onClick={onClose}>
      <div
        className="modal-box bank-classify-modal"
        style={{ width: 'min(760px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Escalate — {supplierLabel}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16 }}>
            The commission report for {periodLabel} shows{' '}
            <strong>{formatCommissionCurrency(commissionTotal)}</strong> owed, but only{' '}
            <strong>{formatCommissionCurrency(depositTotal)}</strong> was deposited.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <SummaryTile label="Reported" value={formatCommissionCurrency(commissionTotal)} />
            <SummaryTile label="Deposited" value={formatCommissionCurrency(depositTotal)} />
            <SummaryTile
              label="Shortfall"
              value={formatCommissionCurrency(shortfall)}
              accent="var(--red)"
            />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
            Commission lines ({lines.length})
          </div>

          {lines.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>No commission line items for this period.</p>
          ) : (
            <table className="admin-mini-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Deal UID</th>
                  <th>Agent</th>
                  <th style={{ textAlign: 'right' }}>Reported</th>
                  <th style={{ textAlign: 'right' }}>Agent payout</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <EscalationRow key={`${line.dealUid}-${line.merchant}`} line={line} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ fontWeight: 600, fontSize: 12 }}>Totals</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {formatCommissionCurrency(commissionTotal)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {formatCommissionCurrency(agentPayoutTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {agentPayoutTotal > 0 && (
            <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 12 }}>
              Agent payouts totaling {formatCommissionCurrency(agentPayoutTotal)} are tied to these
              deals until the shortfall is resolved or payout is excluded.
            </p>
          )}

          {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'flex-end',
            padding: '16px 28px',
            borderTop: '1px solid var(--gray-border)',
          }}
        >
          <button type="button" className="admin-ticket-btn" onClick={onClose} disabled={excluding}>
            Close
          </button>
          <button
            type="button"
            className="admin-ticket-btn"
            disabled={excluding}
            onClick={() => openEmail(supplierPartner?.contact_email, supplierLabel)}
            title={supplierPartner?.contact_email ?? 'Add contact email in Suppliers'}
          >
            Email supplier
          </button>
          <button
            type="button"
            className="admin-ticket-btn"
            disabled={excluding}
            onClick={() =>
              openEmail(
                paySourcePartner?.contact_email ?? supplierPartner?.contact_email,
                paySourceLabel,
              )
            }
            title={paySourcePartner?.contact_email ?? 'Add pay source email in Suppliers'}
          >
            Email pay source
          </button>
          <button
            type="button"
            className="admin-ticket-btn"
            style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}
            disabled={excluding}
            onClick={handleExclude}
          >
            {excluding ? 'Excluding…' : 'Exclude payout'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--gray-light)',
        borderRadius: 8,
        padding: '12px 14px',
        borderLeft: accent ? `3px solid ${accent}` : undefined,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function EscalationRow({ line }: { line: EscalationLine }) {
  return (
    <tr>
      <td style={{ fontSize: 13 }}>{line.merchant}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {line.dealUid || '—'}
        {!line.matched && line.dealUid === '' && (
          <span style={{ color: 'var(--amber)', marginLeft: 4 }}>unmatched</span>
        )}
      </td>
      <td style={{ fontSize: 12, color: 'var(--gray)' }}>{line.agentName}</td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {formatCommissionCurrency(line.reportAmount)}
      </td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {line.agentPayout > 0 ? formatCommissionCurrency(line.agentPayout) : '—'}
      </td>
    </tr>
  );
}

export default EscalateCommissionsModal;
