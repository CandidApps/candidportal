'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  commissionRowCustomer,
  commissionRowUid,
  matchDealToCommissionRow,
} from '@/lib/bmw/commission-match';
import { getAddedDeals } from '@/lib/bmw/added-deals';
import { normalizeUid } from '@/lib/bmw/deal-key';
import {
  SUPPLIER_LABELS,
  commissionRowAmountForBatch,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import { formatCommissionCurrency, formatPeriodLabel } from '@/lib/commissions/commission-store';
import { loadSolutionProviders } from '@/lib/solution-providers';
import { CommissionDealForm } from '@/components/commissions/CommissionDealForm';

type UnmatchedItem = {
  idx: number;
  uid: string;
  customer: string;
  amount: number;
  row: Record<string, unknown>;
};

export function NewDealsModal({
  supplier,
  batch,
  onClose,
}: {
  supplier: SupplierId;
  batch: SupplierImportBatch | undefined;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<UnmatchedItem | null>(null);
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    void loadSolutionProviders();
  }, []);

  const unmatched = useMemo<UnmatchedItem[]>(() => {
    if (!batch) return [];
    const seen = new Set<string>();
    const items: UnmatchedItem[] = [];
    batch.rows.forEach((row, idx) => {
      const rowMatchOpts = { uidField: batch.uidField, customerField: batch.customerField };
      if (matchDealToCommissionRow(supplier, row, rowMatchOpts)) return;
      const uid = commissionRowUid(supplier, row, rowMatchOpts);
      const customer = commissionRowCustomer(row, batch.customerField);
      const amount = commissionRowAmountForBatch(batch, row);
      const dedupeKey = normalizeUid(uid || customer || String(idx));
      if (seen.has(dedupeKey)) {
        const existing = items.find((i) => normalizeUid(i.uid || i.customer || String(i.idx)) === dedupeKey);
        if (existing) existing.amount += amount;
        return;
      }
      seen.add(dedupeKey);
      items.push({ idx, uid, customer, amount, row });
    });
    return items;
  }, [batch, supplier]);

  const addedUids = useMemo(() => {
    void savedTick;
    return new Set(
      getAddedDeals()
        .filter((d) => d.supplier === supplier)
        .map((d) => normalizeUid(d.dealUid)),
    );
  }, [supplier, savedTick]);

  return (
    <div className="modal-overlay open bank-classify-overlay" onClick={onClose}>
      <div className="modal-box bank-classify-modal" style={{ width: 'min(640px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            New deals — {SUPPLIER_LABELS[supplier]}
            {batch ? ` · ${formatPeriodLabel(batch.period)}` : ''}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {selected ? (
            <CommissionDealForm
              key={`${selected.idx}-${selected.uid}`}
              supplier={supplier}
              sourceRow={selected.row}
              initialDealUid={selected.uid}
              initialMerchant={selected.customer}
              initialAmount={selected.amount}
              showProviderProduct
              showLatestCommission
              onSaved={() => {
                setSavedTick((t) => t + 1);
                setSelected(null);
              }}
              onCancel={() => setSelected(null)}
            />
          ) : !batch ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>
              No commission data imported for this period, so there are no line items to review.
            </p>
          ) : unmatched.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>
              Every line item in this import is tied to a deal in the system. Nothing to add.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 12 }}>
                {unmatched.length} line item{unmatched.length === 1 ? '' : 's'} in this import{' '}
                {unmatched.length === 1 ? 'is' : 'are'} not tied to a customer deal in the system.
                Add each as a recurring or one-time deal for future matching.
              </p>
              <table className="admin-mini-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>ID / account</th>
                    <th style={{ textAlign: 'right' }}>Commission</th>
                    <th style={{ width: 90 }} />
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map((item) => {
                    const added = item.uid !== '' && addedUids.has(normalizeUid(item.uid));
                    return (
                      <tr key={item.idx}>
                        <td style={{ fontWeight: 600 }}>{item.customer || '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.uid || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {formatCommissionCurrency(item.amount)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {added ? (
                            <span className="admin-status-pill admin-status-pill--resolved">Added</span>
                          ) : (
                            <button
                              type="button"
                              className="admin-ticket-btn primary"
                              onClick={() => setSelected(item)}
                            >
                              Add
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
        {!selected && (
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--gray-border)' }}>
            <button type="button" className="admin-ticket-btn" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default NewDealsModal;
