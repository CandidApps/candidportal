'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  importPeriodRange,
  parseChaseSheetRows,
  type ParsedChaseRow,
} from '@/lib/bank-deposits/chase-parse';
import {
  buildPreviewRows,
  reconcileBankDeposits,
  type BankDepositPreviewRow,
  type DepositMatchStatus,
} from '@/lib/bank-deposits/commission-reconcile';
import { DepositMatchIcon } from '@/components/commissions/DepositMatchIcon';
import {
  DEPOSIT_TYPE_OPTIONS,
  inferSourceMatch,
  type PartnerSupplierRecord,
} from '@/lib/bank-deposits/source-match';
import {
  formatCommissionCurrency,
  formatPeriodLabel,
} from '@/lib/commissions/commission-store';
import type { SupplierId, SupplierImportBatch } from '@/lib/commissions/supplier-config';
import { SUPPLIER_IDS, SUPPLIER_LABELS } from '@/lib/commissions/supplier-config';
import {
  createPartnerSupplier,
  fetchBankDepositImports,
  fetchBankDepositLines,
  fetchPartnerSuppliers,
  saveBankDepositImport,
  type BankDepositImportSummary,
  type BankDepositLineRecord,
} from '@/lib/services/bank-deposits';

function MatchIcon({ status }: { status: DepositMatchStatus | string }) {
  return <DepositMatchIcon status={status} />;
}

function recomputePreview(
  parsed: ParsedChaseRow[],
  partners: PartnerSupplierRecord[],
  commissionImports: SupplierImportBatch[],
  overrides: Map<number, Partial<BankDepositPreviewRow>>,
): BankDepositPreviewRow[] {
  const base = buildPreviewRows(parsed, partners, commissionImports);
  return base.map((row) => {
    const patch = overrides.get(row.lineIndex);
    if (!patch) return row;

    const merged = { ...row, ...patch };
    if (patch.sourceMatchLabel || patch.supplierKey !== undefined || patch.partnerId !== undefined || patch.depositType) {
      const match = inferSourceMatch(row, partners);
      if (patch.sourceMatchLabel) {
        const partner =
          partners.find((p) => p.id === patch.partnerId) ??
          partners.find((p) => (p.display_name ?? p.name) === patch.sourceMatchLabel) ??
          partners.find((p) => p.name === patch.sourceMatchLabel);
        merged.sourceMatchLabel = patch.sourceMatchLabel;
        merged.partnerId = partner?.id ?? patch.partnerId ?? null;
        merged.supplierKey = (patch.supplierKey as SupplierId | null) ?? (partner?.supplier_key as SupplierId | null) ?? null;
      } else {
        merged.sourceMatchLabel = match.sourceMatchLabel;
        merged.partnerId = match.partnerId;
        merged.supplierKey = match.supplierKey;
      }
    }

    return merged;
  }).map((row, _, arr) => {
    const sourceMatches = arr.map((r) => ({
      row: parsed.find((p) => p.lineIndex === r.lineIndex)!,
      match: {
        partnerId: r.partnerId,
        supplierKey: r.supplierKey,
        sourceMatchLabel: r.sourceMatchLabel,
        confidence: r.sourceMatch.confidence,
      },
      depositType: r.depositType,
    }));
    const reconciled = reconcileBankDeposits(parsed, sourceMatches, commissionImports);
    const updated = reconciled.find((r) => r.lineIndex === row.lineIndex);
    return updated ?? row;
  });
}

type ClassifyModalProps = {
  row: BankDepositPreviewRow;
  partners: PartnerSupplierRecord[];
  onClose: () => void;
  onSave: (patch: Partial<BankDepositPreviewRow>, newPartner?: PartnerSupplierRecord) => void;
};

function ClassifyDepositModal({ row, partners, onClose, onSave }: ClassifyModalProps) {
  const [depositType, setDepositType] = useState(row.depositType);
  const [partnerId, setPartnerId] = useState<number | ''>(row.partnerId ?? '');
  const [newName, setNewName] = useState('');
  const [supplierKey, setSupplierKey] = useState<string>(row.supplierKey ?? '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    try {
      if (depositType === 'Commission' && !partnerId && newName.trim()) {
        setCreating(true);
        const partner = await createPartnerSupplier({
          name: newName.trim(),
          displayName: newName.trim(),
          supplierKey: supplierKey || null,
          bankOrigCoName: row.origCoName,
          bankOrigId: row.origId,
          bankSourceAliases: [newName.trim()],
        });
        onSave(
          {
            depositType,
            partnerId: partner.id,
            supplierKey: (supplierKey as SupplierId) || null,
            sourceMatchLabel: partner.display_name ?? partner.name,
          },
          partner,
        );
        return;
      }

      const partner = partners.find((p) => p.id === partnerId);
      onSave({
        depositType,
        partnerId: partnerId === '' ? null : Number(partnerId),
        supplierKey: (supplierKey as SupplierId) || (partner?.supplier_key as SupplierId | null) || null,
        sourceMatchLabel: partner?.display_name ?? partner?.name ?? row.sourceMatchLabel,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save classification');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay open bank-classify-overlay" onClick={onClose}>
      <div className="modal-box bank-classify-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Classify deposit</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 12 }}>
            {row.description.slice(0, 120)}{row.description.length > 120 ? '…' : ''}
          </p>
          <div className="form-group">
            <label>Amount</label>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatCommissionCurrency(row.amount)}</div>
          </div>
          <div className="form-group">
            <label>Type</label>
            <select
              className="comm-period-select"
              style={{ width: '100%' }}
              value={depositType}
              onChange={(e) => setDepositType(e.target.value)}
            >
              {DEPOSIT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {depositType === 'Commission' && (
            <>
              <div className="form-group">
                <label>Source / supplier</label>
                <select
                  className="comm-period-select"
                  style={{ width: '100%' }}
                  value={partnerId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPartnerId(val === '' ? '' : Number(val));
                    const p = partners.find((x) => x.id === Number(val));
                    if (p?.supplier_key) setSupplierKey(p.supplier_key);
                  }}
                >
                  <option value="">— New or unmatched —</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name ?? p.name}</option>
                  ))}
                </select>
              </div>
              {!partnerId && (
                <>
                  <div className="form-group">
                    <label>New supplier name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. TekSystems"
                    />
                  </div>
                  <div className="form-group">
                    <label>Commission supplier (optional)</label>
                    <select
                      className="comm-period-select"
                      style={{ width: '100%' }}
                      value={supplierKey}
                      onChange={(e) => setSupplierKey(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {SUPPLIER_IDS.map((id) => (
                        <option key={id} value={id}>{SUPPLIER_LABELS[id]}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </>
          )}
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--gray-border)' }}>
          <button type="button" className="admin-ticket-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-ticket-btn primary" disabled={creating} onClick={() => void handleSave()}>
            {creating ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewTable({
  rows,
  partners,
  commissionImports,
  onRowsChange,
  onClassifyRow,
}: {
  rows: BankDepositPreviewRow[];
  partners: PartnerSupplierRecord[];
  commissionImports: SupplierImportBatch[];
  onRowsChange: (rows: BankDepositPreviewRow[]) => void;
  onClassifyRow: (row: BankDepositPreviewRow) => void;
}) {
  const updateRow = (lineIndex: number, patch: Partial<BankDepositPreviewRow>) => {
    const parsed = rows.map(({ lineIndex: li, postingDate, description, amount, details, sheetType, sheetSource, origCoName, origId, commissionPeriod }) => ({
      lineIndex: li,
      postingDate,
      description,
      amount,
      details,
      sheetType,
      sheetSource,
      origCoName,
      origId,
      commissionPeriod,
    }));
    const overrides = new Map<number, Partial<BankDepositPreviewRow>>();
    for (const row of rows) {
      if (row.lineIndex === lineIndex) {
        overrides.set(lineIndex, { ...row, ...patch });
      } else {
        overrides.set(row.lineIndex, row);
      }
    }
    onRowsChange(recomputePreview(parsed, partners, commissionImports, overrides));
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="admin-tickets-table bank-deposit-table">
        <thead>
          <tr>
            <th>Posting date</th>
            <th>Description</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th>Type</th>
            <th>Source match</th>
            <th style={{ textAlign: 'center' }}>Match</th>
            <th style={{ textAlign: 'right' }}>Supplier comm.</th>
            <th style={{ textAlign: 'right' }}>Variance</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].sort((a, b) => a.sourceMatchLabel.toLowerCase().localeCompare(b.sourceMatchLabel.toLowerCase())).map((row) => (
            <tr
              key={row.lineIndex}
              className="bank-deposit-row"
              onClick={() => onClassifyRow(row)}
              title="Click to classify or edit"
            >
              <td className="bank-deposit-time">{row.postingDate}</td>
              <td>
                <div className="bank-deposit-desc">{row.description}</div>
                {row.origCoName && (
                  <div className="bank-deposit-meta">ORIG: {row.origCoName}{row.origId ? ` · ${row.origId}` : ''}</div>
                )}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {formatCommissionCurrency(row.amount)}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <select
                  className="bank-deposit-select"
                  value={row.depositType}
                  onChange={(e) => updateRow(row.lineIndex, { depositType: e.target.value })}
                >
                  {DEPOSIT_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <select
                  className="bank-deposit-select"
                  value={row.partnerId ?? ''}
                  onChange={(e) => {
                    const pid = e.target.value === '' ? null : Number(e.target.value);
                    const partner = partners.find((p) => p.id === pid);
                    updateRow(row.lineIndex, {
                      partnerId: pid,
                      supplierKey: (partner?.supplier_key as SupplierId | null) ?? null,
                      sourceMatchLabel: partner?.display_name ?? partner?.name ?? 'Unmatched',
                    });
                  }}
                >
                  <option value="">Unmatched</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name ?? p.name}</option>
                  ))}
                </select>
              </td>
              <td style={{ textAlign: 'center' }}>
                <MatchIcon status={row.matchStatus} />
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                {row.supplierCommissionAmount != null ? formatCommissionCurrency(row.supplierCommissionAmount) : '—'}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: row.variance && Math.abs(row.variance) > 0.02 ? 'var(--red)' : 'var(--gray)' }}>
                {row.variance != null ? formatCommissionCurrency(row.variance) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BankDepositsPanel({
  commissionImports,
}: {
  commissionImports: SupplierImportBatch[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [partners, setPartners] = useState<PartnerSupplierRecord[]>([]);
  const [imports, setImports] = useState<BankDepositImportSummary[]>([]);
  const [savedLines, setSavedLines] = useState<BankDepositLineRecord[]>([]);
  const [previewRows, setPreviewRows] = useState<BankDepositPreviewRow[] | null>(null);
  const [previewFilename, setPreviewFilename] = useState('');
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
  const [classifyRow, setClassifyRow] = useState<BankDepositPreviewRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, i] = await Promise.all([fetchPartnerSuppliers(), fetchBankDepositImports()]);
      setPartners(p);
      setImports(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bank deposits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedImportId) {
      setSavedLines([]);
      return;
    }
    void fetchBankDepositLines(selectedImportId).then(setSavedLines).catch(() => setSavedLines([]));
  }, [selectedImportId]);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]!];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false }) as Record<string, unknown>[];
      const parsed = parseChaseSheetRows(rawRows);
      if (!parsed.length) {
        setError('No recognizable Chase rows found. Expected Details, Posting Date, Description, and Amount columns.');
        return;
      }
      const currentPartners = partners.length ? partners : await fetchPartnerSuppliers();
      if (!partners.length) setPartners(currentPartners);
      setPreviewFilename(file.name);
      setPreviewRows(buildPreviewRows(parsed, currentPartners, commissionImports));
      setSelectedImportId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse bank sheet');
    }
  };

  const handleSavePreview = async () => {
    if (!previewRows?.length) return;
    setSaving(true);
    setError(null);
    try {
      const range = importPeriodRange(previewRows);
      await saveBankDepositImport({
        filename: previewFilename,
        periodStart: range.start,
        periodEnd: range.end,
        lines: previewRows.map((row) => ({
          lineIndex: row.lineIndex,
          details: row.details,
          postingDate: row.postingDate,
          description: row.description,
          amount: row.amount,
          depositType: row.depositType,
          partnerId: row.partnerId,
          supplierKey: row.supplierKey,
          sourceMatchLabel: row.sourceMatchLabel,
          origCoName: row.origCoName,
          origId: row.origId,
          commissionPeriod: row.commissionPeriod,
          supplierCommissionAmount: row.supplierCommissionAmount,
          matchStatus: row.matchStatus,
          variance: row.variance,
        })),
      });
      setPreviewRows(null);
      setPreviewFilename('');
      await refresh();
      window.dispatchEvent(new Event('candid-commissions-updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save import');
    } finally {
      setSaving(false);
    }
  };

  const previewStats = useMemo(() => {
    if (!previewRows) return null;
    const commissionRows = previewRows.filter((r) => r.depositType === 'Commission');
    return {
      total: previewRows.reduce((s, r) => s + r.amount, 0),
      matched: commissionRows.filter((r) => r.matchStatus === 'matched').length,
      mismatch: commissionRows.filter((r) => r.matchStatus === 'mismatch').length,
      noData: commissionRows.filter((r) => r.matchStatus === 'no_commission_data').length,
    };
  }, [previewRows]);

  if (loading && !imports.length && !previewRows) {
    return <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading bank deposits…</p>;
  }

  return (
    <div>
      <div className="comm-bulk-bar">
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)' }}>Chase bank deposits</div>
        <button
          type="button"
          className="admin-ticket-btn primary"
          onClick={() => fileRef.current?.click()}
        >
          Add new import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
        {previewRows && (
          <>
            <button type="button" className="admin-ticket-btn" onClick={() => { setPreviewRows(null); setPreviewFilename(''); }}>
              Cancel preview
            </button>
            <button type="button" className="admin-ticket-btn primary" disabled={saving} onClick={() => void handleSavePreview()}>
              {saving ? 'Saving…' : 'Save import'}
            </button>
          </>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {previewRows && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">Import preview — {previewFilename}</div>
            {previewStats && (
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                {previewRows.length} rows · {previewStats.matched} matched · {previewStats.mismatch} variance · {previewStats.noData} no commission data
              </div>
            )}
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <PreviewTable
              rows={previewRows}
              partners={partners}
              commissionImports={commissionImports}
              onRowsChange={setPreviewRows}
              onClassifyRow={setClassifyRow}
            />
          </div>
        </div>
      )}

      {!previewRows && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Saved imports</div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {imports.length === 0 ? (
              <p style={{ padding: 20, fontSize: 13, color: 'var(--gray)' }}>
                No bank imports yet. Upload a Chase activity export to reconcile deposits against supplier commissions.
              </p>
            ) : (
              <table className="admin-mini-table comm-table">
                <thead>
                  <tr>
                    <th>Imported</th>
                    <th>File</th>
                    <th>Period range</th>
                    <th style={{ textAlign: 'right' }}>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <Fragment key={imp.id}>
                      <tr
                        className="comm-row-clickable"
                        onClick={() => setSelectedImportId(selectedImportId === imp.id ? null : imp.id)}
                      >
                        <td>{new Date(imp.imported_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td style={{ fontWeight: 600 }}>{imp.filename}</td>
                        <td>
                          {imp.period_start && imp.period_end
                            ? `${formatPeriodLabel(imp.period_start)} – ${formatPeriodLabel(imp.period_end)}`
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>{imp.row_count}</td>
                      </tr>
                      {selectedImportId === imp.id && savedLines.length > 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 0, background: 'var(--gray-light)' }}>
                            <table className="admin-mini-table" style={{ margin: 16 }}>
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Source</th>
                                  <th>Type</th>
                                  <th style={{ textAlign: 'right' }}>Amount</th>
                                  <th style={{ textAlign: 'center' }}>Match</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...savedLines].sort((a, b) => (a.source_match_label ?? '').toLowerCase().localeCompare((b.source_match_label ?? '').toLowerCase())).map((line) => (
                                  <tr key={line.id}>
                                    <td>{line.posting_date}</td>
                                    <td>{line.source_match_label ?? '—'}</td>
                                    <td>{line.deposit_type}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCommissionCurrency(line.amount)}</td>
                                    <td style={{ textAlign: 'center' }}><MatchIcon status={line.match_status} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {classifyRow && (
        <ClassifyDepositModal
          row={classifyRow}
          partners={partners}
          onClose={() => setClassifyRow(null)}
          onSave={(patch, newPartner) => {
            if (newPartner) setPartners((prev) => [...prev, newPartner]);
            setPreviewRows((prev) => {
              if (!prev) return prev;
              const parsed = prev.map(({ lineIndex, postingDate, description, amount, details, sheetType, sheetSource, origCoName, origId, commissionPeriod }) => ({
                lineIndex, postingDate, description, amount, details, sheetType, sheetSource, origCoName, origId, commissionPeriod,
              }));
              const overrides = new Map(prev.map((r) => [r.lineIndex, r.lineIndex === classifyRow.lineIndex ? { ...r, ...patch } : r]));
              return recomputePreview(parsed, newPartner ? [...partners, newPartner] : partners, commissionImports, overrides);
            });
            setClassifyRow(null);
          }}
        />
      )}
    </div>
  );
}

export default BankDepositsPanel;
