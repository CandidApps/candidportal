'use client';

import { useMemo, useState } from 'react';
import {
  SUPPLIER_IDS,
  SUPPLIER_LABELS,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import { formatPeriodLabel } from '@/lib/commissions/commission-store';
import {
  resolveBatchColumnMapping,
  sampleColumnValues,
} from '@/lib/commissions/supplier-column-mapping';
import {
  getSupplierPeriodMapping,
  saveSupplierPeriodMappings,
} from '@/lib/commissions/supplier-mapping-store';
import { getManualImport, saveManualImport } from '@/lib/commissions/manual-imports';

type DraftMapping = {
  supplier: SupplierId;
  dealUidField: string;
  customerField: string;
  amountField: string;
  headers: string[];
  rowCount: number;
  samples: {
    dealUid: string[];
    customer: string[];
    amount: string[];
  };
};

function batchForSupplier(
  imports: SupplierImportBatch[],
  supplier: SupplierId,
  period: string,
): SupplierImportBatch | undefined {
  return imports.find((b) => b.supplier === supplier && b.period === period);
}

function buildDrafts(imports: SupplierImportBatch[], period: string): DraftMapping[] {
  return SUPPLIER_IDS.map((supplier) => {
    const batch = batchForSupplier(imports, supplier, period);
    const rows = batch?.rows ?? [];
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const stored = getSupplierPeriodMapping(supplier, period);
    const resolved = resolveBatchColumnMapping(supplier, rows, {
      uidField: stored?.dealUidField || batch?.uidField,
      customerField: stored?.customerField || batch?.customerField,
      amountField: stored?.amountField || batch?.amountField,
    });
    return {
      supplier,
      dealUidField: resolved.dealUidField,
      customerField: resolved.customerField,
      amountField: resolved.amountField,
      headers,
      rowCount: rows.length || batch?.rowCount || 0,
      samples: {
        dealUid: sampleColumnValues(rows, resolved.dealUidField),
        customer: sampleColumnValues(rows, resolved.customerField),
        amount: sampleColumnValues(rows, resolved.amountField),
      },
    };
  });
}

function SampleHint({ values }: { values: string[] }) {
  if (!values.length) {
    return <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>No sample values</div>;
  }
  return (
    <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
      e.g. {values.join(' · ')}
    </div>
  );
}

function MappingFieldSelect({
  label,
  value,
  headers,
  samples,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  headers: string[];
  samples: string[];
  onChange: (next: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <select
        className="comm-period-select"
        style={{ width: '100%' }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!headers.length}
      >
        <option value="">{optional ? '— Optional —' : '— Select column —'}</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <SampleHint values={samples} />
    </div>
  );
}

export function SupplierCommissionMappingModal({
  period,
  imports,
  onClose,
  onSaved,
}: {
  period: string;
  imports: SupplierImportBatch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<DraftMapping[]>(() => buildDrafts(imports, period));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withData = useMemo(() => drafts.filter((d) => d.headers.length > 0), [drafts]);
  const withoutData = useMemo(() => drafts.filter((d) => d.headers.length === 0), [drafts]);

  const updateDraft = (
    supplier: SupplierId,
    patch: Partial<Pick<DraftMapping, 'dealUidField' | 'customerField' | 'amountField'>>,
  ) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.supplier !== supplier) return d;
        const next = { ...d, ...patch };
        const batch = batchForSupplier(imports, supplier, period);
        const rows = batch?.rows ?? [];
        next.samples = {
          dealUid: sampleColumnValues(rows, next.dealUidField),
          customer: sampleColumnValues(rows, next.customerField),
          amount: sampleColumnValues(rows, next.amountField),
        };
        return next;
      }),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const editable = drafts.filter((d) => d.headers.length > 0);
      for (const draft of editable) {
        if (!draft.dealUidField.trim() || !draft.amountField.trim()) {
          setError(`${SUPPLIER_LABELS[draft.supplier]} needs a deal ID column and amount column.`);
          setSaving(false);
          return;
        }
      }

      saveSupplierPeriodMappings(
        period,
        editable.map((d) => ({
          supplier: d.supplier,
          dealUidField: d.dealUidField,
          customerField: d.customerField,
          amountField: d.amountField,
        })),
      );

      // Keep manual imports in sync so matching uses the same columns after refresh.
      await Promise.all(
        editable.map(async (draft) => {
          const existing = getManualImport(draft.supplier, period);
          if (!existing) return;
          await saveManualImport({
            ...existing,
            amountField: draft.amountField,
            uidField: draft.dealUidField,
            customerField: draft.customerField || undefined,
          });
        }),
      );

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save mappings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open bank-classify-overlay">
      <div
        className="modal-box bank-classify-modal"
        style={{ width: 'min(820px, 96vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Commission column mapping — {formatPeriodLabel(period)}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 14 }}>
            Confirm which spreadsheet / report columns map to deal ID, customer, and commission amount
            for each supplier this month. Sample values come from the imported rows.
          </p>

          {withData.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>
              No supplier report rows are loaded for {formatPeriodLabel(period)} yet. Import or open a
              supplier detail first, then reopen Mapping.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {withData.map((draft) => (
                <div
                  key={draft.supplier}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: 'var(--gray-light)',
                    border: '1px solid var(--gray-border)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 10,
                      alignItems: 'baseline',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {SUPPLIER_LABELS[draft.supplier]}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray)' }}>
                      {draft.rowCount} row{draft.rowCount === 1 ? '' : 's'} · {draft.headers.length}{' '}
                      columns
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 12,
                    }}
                  >
                    <MappingFieldSelect
                      label="Deal ID / account column"
                      value={draft.dealUidField}
                      headers={draft.headers}
                      samples={draft.samples.dealUid}
                      onChange={(dealUidField) => updateDraft(draft.supplier, { dealUidField })}
                    />
                    <MappingFieldSelect
                      label="Customer / merchant column"
                      value={draft.customerField}
                      headers={draft.headers}
                      samples={draft.samples.customer}
                      onChange={(customerField) => updateDraft(draft.supplier, { customerField })}
                      optional
                    />
                    <MappingFieldSelect
                      label="Commission amount column"
                      value={draft.amountField}
                      headers={draft.headers}
                      samples={draft.samples.amount}
                      onChange={(amountField) => updateDraft(draft.supplier, { amountField })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {withoutData.length > 0 && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--gray)' }}>
              No row data this month for:{' '}
              {withoutData.map((d) => SUPPLIER_LABELS[d.supplier]).join(', ')}.
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--red)' }}>{error}</div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="admin-ticket-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-ticket-btn primary"
            disabled={saving || withData.length === 0}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save mappings'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SupplierCommissionMappingModal;
