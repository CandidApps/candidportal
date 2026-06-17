'use client';

import { useMemo, useRef, useState } from 'react';
import {
  SUPPLIER_LABELS,
  amountFieldForSupplier,
  type SupplierId,
} from '@/lib/commissions/supplier-config';
import { saveManualImport } from '@/lib/commissions/manual-imports';
import { formatCommissionCurrency, formatPeriodLabel } from '@/lib/commissions/commission-store';

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

export function ManualImportModal({
  supplier,
  period,
  onClose,
  onSaved,
}: {
  supplier: SupplierId;
  period: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [amountField, setAmountField] = useState('');
  const [importPeriod, setImportPeriod] = useState(period);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => (rows.length ? Object.keys(rows[0]!) : []), [rows]);
  const numericHeaders = useMemo(
    () => headers.filter((h) => looksNumeric(rows, h)),
    [headers, rows],
  );

  const total = useMemo(() => {
    if (!amountField) return 0;
    return rows.reduce((s, row) => {
      const v = row[amountField];
      const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [rows, amountField]);

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
      // Default the amount column to the supplier's configured field when present.
      const configured = amountFieldForSupplier(supplier);
      const keys = Object.keys(parsed[0]!);
      const match = keys.find((k) => k.toLowerCase() === configured.toLowerCase());
      setAmountField(match ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse the file.');
    }
  };

  const handleSave = () => {
    if (!rows.length || !filename) {
      setError('Choose a commission report file first.');
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
    saveManualImport({
      supplier,
      period: importPeriod,
      amountField,
      filename,
      importedAt: new Date().toISOString(),
      rows,
    });
    onSaved();
    onClose();
  };

  return (
    <div className="modal-overlay open bank-classify-overlay" onClick={onClose}>
      <div className="modal-box bank-classify-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Manual upload — {SUPPLIER_LABELS[supplier]}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 14 }}>
            No commission report was auto-imported for {formatPeriodLabel(period)}. Upload the
            missing report (.xlsx or .csv) to add it manually.
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
              <div className="form-group">
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
              {amountField && (
                <div className="form-group">
                  <label>Total commission</label>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {formatCommissionCurrency(Math.round(total * 100) / 100)}
                  </div>
                </div>
              )}
            </>
          )}
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--gray-border)' }}>
          <button type="button" className="admin-ticket-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-ticket-btn primary" disabled={!rows.length} onClick={handleSave}>
            Add report
          </button>
        </div>
      </div>
    </div>
  );
}

export default ManualImportModal;
