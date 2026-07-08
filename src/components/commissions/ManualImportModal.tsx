'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  commissionRowCustomer,
  commissionRowUid,
  matchDealToCommissionRow,
} from '@/lib/bmw/commission-match';
import { getBmwAgentRates } from '@/lib/bmw/deal-master';
import { saveCommissionDeal, type CommissionDealType } from '@/lib/bmw/added-deals';
import { recognizeAgentFromRow } from '@/lib/commissions/commission-deal-prefill';
import {
  SUPPLIER_LABELS,
  type SupplierId,
} from '@/lib/commissions/supplier-config';
import { saveManualImport } from '@/lib/commissions/manual-imports';
import { formatCommissionCurrency, formatPeriodLabel } from '@/lib/commissions/commission-store';
import {
  rowValueFromColumn,
  suggestSupplierColumnMapping,
} from '@/lib/commissions/supplier-column-mapping';
import { OpenCommissionPortalButton } from '@/components/commissions/OpenCommissionPortalButton';
import {
  CommissionDealRowFields,
  agentNameForId,
  agentRateForId,
} from '@/components/commissions/CommissionDealForm';

function looksNumeric(rows: Record<string, unknown>[], key: string): boolean {
  let hits = 0;
  for (const row of rows.slice(0, 20)) {
    const v = row[key];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n)) hits += 1;
  }
  return hits > 0;
}

function rowAmount(row: Record<string, unknown>, field: string): number {
  const v = row[field];
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

type DealDraft = {
  key: string;
  include: boolean;
  dealUid: string;
  merchant: string;
  agentCommId: string;
  commissionType: CommissionDealType;
  amount: number;
  matched: boolean;
};

export function ManualImportModal({
  supplier,
  period,
  hasExistingData = false,
  onClose,
  onSaved,
}: {
  supplier: SupplierId;
  period: string;
  hasExistingData?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [dealUidField, setDealUidField] = useState('');
  const [customerField, setCustomerField] = useState('');
  const [amountField, setAmountField] = useState('');
  const [importPeriod, setImportPeriod] = useState(period);
  const [saveAsDeals, setSaveAsDeals] = useState(false);
  const [dealDrafts, setDealDrafts] = useState<DealDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const agents = useMemo(() => getBmwAgentRates().slice().sort((a, b) => a.name.localeCompare(b.name)), []);

  const headers = useMemo(() => (rows.length ? Object.keys(rows[0]!) : []), [rows]);
  const numericHeaders = useMemo(
    () => headers.filter((h) => looksNumeric(rows, h)),
    [headers, rows],
  );

  const total = useMemo(() => {
    if (!amountField) return 0;
    return rows.reduce((s, row) => s + rowAmount(row, amountField), 0);
  }, [rows, amountField]);

  const rowMatchOpts = useMemo(
    () => ({ uidField: dealUidField || null, customerField: customerField || null }),
    [dealUidField, customerField],
  );

  useEffect(() => {
    if (!rows.length || !amountField) {
      setDealDrafts([]);
      return;
    }
    setDealDrafts(
      rows.map((row, idx) => {
        const dealUid = rowValueFromColumn(row, dealUidField) || commissionRowUid(supplier, row, rowMatchOpts);
        const merchant = rowValueFromColumn(row, customerField) || commissionRowCustomer(row, customerField);
        const amount = rowAmount(row, amountField);
        const matched = Boolean(matchDealToCommissionRow(supplier, row, rowMatchOpts));
        const agent = recognizeAgentFromRow(row, merchant, agents);
        return {
          key: `${idx}-${dealUid || merchant || idx}`,
          include: !matched,
          dealUid,
          merchant,
          agentCommId: agent?.id ?? '',
          commissionType: 'recurring' as CommissionDealType,
          amount,
          matched,
        };
      }),
    );
  }, [rows, amountField, dealUidField, customerField, supplier, agents, rowMatchOpts]);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const parsed = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
      if (!parsed.length) {
        setError('No rows found in the first sheet of that file.');
        return;
      }
      setRows(parsed);
      setFilename(file.name);
      const keys = Object.keys(parsed[0]!);
      const mapping = suggestSupplierColumnMapping(supplier, keys);
      setDealUidField(mapping.dealUidField);
      setCustomerField(mapping.customerField);
      setAmountField(mapping.amountField);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse the file.');
    }
  };

  const updateDraft = (key: string, patch: Partial<DealDraft>) => {
    setDealDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const handleSave = () => {
    if (!rows.length || !filename) {
      setError('Choose a commission report file first.');
      return;
    }
    if (!dealUidField) {
      setError('Select which column holds the deal ID / account number.');
      return;
    }
    if (!amountField) {
      setError('Select which column holds the commission amount.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(importPeriod)) {
      setError('Period must be in YYYY-MM format.');
      return;
    }
    if (
      hasExistingData
      && importPeriod === period
      && !window.confirm(
        `Replace the existing ${SUPPLIER_LABELS[supplier]} report for ${formatPeriodLabel(importPeriod)}? The previous data for this month will be overwritten.`,
      )
    ) {
      return;
    }

    if (saveAsDeals) {
      const picked = dealDrafts.filter((d) => d.include);
      for (const draft of picked) {
        if (!draft.dealUid.trim() || !draft.merchant.trim()) {
          setError('Each included row needs a deal UID and merchant name.');
          return;
        }
        if (!draft.agentCommId) {
          setError('Each included row needs an agent selected.');
          return;
        }
      }
    }

    if (saveAsDeals) {
      for (const draft of dealDrafts.filter((d) => d.include)) {
        saveCommissionDeal({
          supplier,
          dealUid: draft.dealUid.trim(),
          merchant: draft.merchant.trim(),
          agentCommId: draft.agentCommId,
          agentName: agentNameForId(agents, draft.agentCommId),
          commissionRate: agentRateForId(agents, draft.agentCommId),
          commissionType: draft.commissionType,
        });
      }
    }

    void saveManualImport({
      supplier,
      period: importPeriod,
      amountField,
      uidField: dealUidField,
      customerField: customerField || undefined,
      filename,
      importedAt: new Date().toISOString(),
      rows,
    })
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not save the manual import.');
      });
  };

  const includedCount = dealDrafts.filter((d) => d.include).length;
  const unmatchedCount = dealDrafts.filter((d) => !d.matched).length;

  return (
    <div className="modal-overlay open bank-classify-overlay" onClick={onClose}>
      <div
        className="modal-box bank-classify-modal"
        style={{ width: 'min(760px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{hasExistingData ? 'Reupload' : 'Manual upload'} — {SUPPLIER_LABELS[supplier]}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 14 }}>
            {hasExistingData
              ? `Upload a new commission report for ${formatPeriodLabel(period)} to replace the data already on file for this month.`
              : `Upload the commission report (.xlsx or .csv) for ${formatPeriodLabel(period)}.`}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
          <div className="form-group">
            <label>Report file</label>
            <button type="button" className="admin-ticket-btn" onClick={() => fileRef.current?.click()}>
              {filename ? `${filename} · ${rows.length} rows` : 'Choose file…'}
            </button>
          </div>
          {rows.length > 0 && (
            <>
              <div className="form-group">
                <label>Commission period</label>
                <input
                  type="month"
                  value={importPeriod}
                  onChange={(e) => setImportPeriod(e.target.value)}
                />
              </div>
              <div
                style={{
                  marginTop: 8,
                  padding: 14,
                  borderRadius: 8,
                  background: 'var(--gray-light)',
                  border: '1px solid var(--gray-border)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                  Confirm column mapping
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray)', margin: '0 0 12px' }}>
                  Match each spreadsheet column to the field we use for imports. Change any mapping that looks wrong before saving.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Deal ID / account column</label>
                    <select
                      className="comm-period-select"
                      style={{ width: '100%' }}
                      value={dealUidField}
                      onChange={(e) => setDealUidField(e.target.value)}
                    >
                      <option value="">— Select column —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Customer / merchant column</label>
                    <select
                      className="comm-period-select"
                      style={{ width: '100%' }}
                      value={customerField}
                      onChange={(e) => setCustomerField(e.target.value)}
                    >
                      <option value="">— Optional —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Commission amount column</label>
                    <select
                      className="comm-period-select"
                      style={{ width: '100%' }}
                      value={amountField}
                      onChange={(e) => setAmountField(e.target.value)}
                    >
                      <option value="">— Select column —</option>
                      {(numericHeaders.length ? numericHeaders : headers).map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {amountField && (
                <div className="form-group">
                  <label>Total commission</label>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {formatCommissionCurrency(Math.round(total * 100) / 100)}
                  </div>
                </div>
              )}

              {amountField && dealDrafts.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--gray-border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
                    <input
                      type="checkbox"
                      checked={saveAsDeals}
                      onChange={(e) => setSaveAsDeals(e.target.checked)}
                    />
                    Save rows as deals for future matching
                    {unmatchedCount > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--gray)' }}>
                        ({unmatchedCount} unmatched pre-selected)
                      </span>
                    )}
                  </label>

                  {saveAsDeals && (
                    <table className="admin-mini-table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }} />
                          <th>Deal UID</th>
                          <th>Merchant</th>
                          <th>Agent / type</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dealDrafts.map((draft) => (
                          <tr key={draft.key} style={draft.matched ? { opacity: 0.65 } : undefined}>
                            <td>
                              <input
                                type="checkbox"
                                checked={draft.include}
                                onChange={(e) => updateDraft(draft.key, { include: e.target.checked })}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={draft.dealUid}
                                onChange={(e) => updateDraft(draft.key, { dealUid: e.target.value })}
                                style={{ width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={draft.merchant}
                                onChange={(e) => updateDraft(draft.key, { merchant: e.target.value })}
                                style={{ width: '100%', fontSize: 12 }}
                              />
                            </td>
                            <td>
                              <CommissionDealRowFields
                                agentCommId={draft.agentCommId}
                                commissionType={draft.commissionType}
                                agents={agents}
                                onAgentChange={(id) => updateDraft(draft.key, { agentCommId: id })}
                                onTypeChange={(type) => updateDraft(draft.key, { commissionType: type })}
                              />
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                              {formatCommissionCurrency(draft.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {saveAsDeals && includedCount === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 8 }}>
                      Select at least one row to save as a deal.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--gray-border)' }}>
          <OpenCommissionPortalButton supplierId={supplier} style={{ marginRight: 'auto' }} />
          <button type="button" className="admin-ticket-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-ticket-btn primary" disabled={!rows.length || !dealUidField || !amountField} onClick={handleSave}>
            {hasExistingData && importPeriod === period ? 'Replace report' : 'Add report'}
            {saveAsDeals && includedCount > 0 ? ` · save ${includedCount} deal${includedCount === 1 ? '' : 's'}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ManualImportModal;
