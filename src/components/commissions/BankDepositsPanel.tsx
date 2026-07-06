'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  importPeriodRange,
  parseChaseSheetRows,
  postingDateToIso,
  type ParsedChaseRow,
} from '@/lib/bank-deposits/chase-parse';
import { canonicalPaySource } from '@/lib/commission-partners';
import { commissionPeriodFromPostingMonth, periodAfter, periodBefore } from '@/lib/commissions/period-utils';
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
  availableCommissionPeriods,
  currentPeriod,
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
  updateBankDepositImport,
  type BankDepositImportSummary,
  type BankDepositLineRecord,
} from '@/lib/services/bank-deposits';

function MatchIcon({ status }: { status: DepositMatchStatus | string }) {
  return <DepositMatchIcon status={status} />;
}

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToSlashPostingDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${Number(m)}/${Number(d)}/${y}`;
}

function commissionPeriodFromIsoDate(iso: string): string | null {
  if (!/^\d{4}-\d{2}/.test(iso)) return null;
  return commissionPeriodFromPostingMonth(iso.slice(0, 7));
}

function postingDateForPeriodDerivation(postingDate: string): string {
  const trimmed = postingDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  if (trimmed.includes('/')) return postingDateToIso(trimmed);
  return trimmed;
}

function buildManualPeriodOptions(
  imports: SupplierImportBatch[],
  postingDate: string,
): string[] {
  const iso = postingDateForPeriodDerivation(postingDate);
  const periods = new Set<string>([
    currentPeriod(),
    ...availableCommissionPeriods(imports),
  ]);
  const derived = commissionPeriodFromIsoDate(iso);
  if (derived) periods.add(derived);

  let cursor = currentPeriod();
  for (let i = 0; i < 12; i += 1) {
    periods.add(cursor);
    cursor = periodBefore(cursor);
  }
  cursor = currentPeriod();
  for (let i = 0; i < 3; i += 1) {
    cursor = periodAfter(cursor);
    periods.add(cursor);
  }

  return [...periods].sort((a, b) => b.localeCompare(a));
}

function buildPeriodOptions(
  imports: SupplierImportBatch[],
  postingDate: string,
  currentValue?: string | null,
): string[] {
  const opts = buildManualPeriodOptions(imports, postingDate);
  if (currentValue && !opts.includes(currentValue)) {
    return [currentValue, ...opts].sort((a, b) => b.localeCompare(a));
  }
  return opts;
}

type ManualDepositDraft = {
  postingDate: string;
  commissionPeriod: string;
  partnerId: number;
  depositType: string;
  amount: number;
  note: string;
};

function manualDraftToParsedRow(lineIndex: number, draft: ManualDepositDraft, partner: PartnerSupplierRecord): ParsedChaseRow {
  const label = canonicalPaySource(partner.display_name ?? partner.name);
  const note = draft.note.trim();
  return {
    lineIndex,
    details: 'Manual entry',
    postingDate: isoToSlashPostingDate(draft.postingDate),
    description: note || `Manual deposit — ${label}`,
    amount: draft.amount,
    sheetType: draft.depositType,
    sheetSource: label,
    origCoName: null,
    origId: null,
    commissionPeriod: draft.commissionPeriod,
  };
}

function buildManualPreviewRows(
  drafts: ManualDepositDraft[],
  partners: PartnerSupplierRecord[],
  commissionImports: SupplierImportBatch[],
): BankDepositPreviewRow[] {
  const parsed = drafts.map((draft, i) => {
    const partner = partners.find((p) => p.id === draft.partnerId)!;
    return manualDraftToParsedRow(i, draft, partner);
  });
  const overrides = new Map<number, Partial<BankDepositPreviewRow>>(
    drafts.map((draft, i) => {
      const partner = partners.find((p) => p.id === draft.partnerId)!;
      const label = canonicalPaySource(partner.display_name ?? partner.name);
      return [
        i,
        {
          depositType: draft.depositType,
          partnerId: partner.id,
          supplierKey: (partner.supplier_key as SupplierId | null) ?? null,
          sourceMatchLabel: label,
          commissionPeriod: draft.commissionPeriod,
        },
      ];
    }),
  );
  return recomputePreview(parsed, partners, commissionImports, overrides);
}

type ManualDepositModalProps = {
  partners: PartnerSupplierRecord[];
  commissionImports: SupplierImportBatch[];
  onClose: () => void;
  onSaved: () => void;
};

function ManualDepositModal({ partners, commissionImports, onClose, onSaved }: ManualDepositModalProps) {
  const initialPostingDate = todayIsoDate();
  const [postingDate, setPostingDate] = useState(initialPostingDate);
  const [commissionPeriod, setCommissionPeriod] = useState(
    () => commissionPeriodFromIsoDate(initialPostingDate) ?? currentPeriod(),
  );
  const [partnerId, setPartnerId] = useState<number | ''>('');
  const [depositType, setDepositType] = useState('Commission');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [queue, setQueue] = useState<ManualDepositDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodOptions = useMemo(
    () => buildPeriodOptions(commissionImports, postingDate, commissionPeriod),
    [commissionImports, postingDate, commissionPeriod],
  );

  const sortedPartners = useMemo(
    () => partners.slice().sort((a, b) => (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name)),
    [partners],
  );

  const handlePostingDateChange = (iso: string) => {
    setPostingDate(iso);
    const derived = commissionPeriodFromIsoDate(iso);
    if (derived) setCommissionPeriod(derived);
  };

  const tryReadCurrentDraft = (): ManualDepositDraft | null => {
    if (!partnerId || !amount.trim() || !commissionPeriod) return null;
    const n = Number(String(amount).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n) || n === 0 || !postingDate) return null;
    return {
      postingDate,
      commissionPeriod,
      partnerId: Number(partnerId),
      depositType,
      amount: Math.round(n * 100) / 100,
      note,
    };
  };

  const readCurrentDraft = (): ManualDepositDraft | null => {
    if (!partnerId) {
      setError('Select a source.');
      return null;
    }
    if (!commissionPeriod) {
      setError('Select a commission period.');
      return null;
    }
    const n = Number(String(amount).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n) || n === 0) {
      setError('Enter a non-zero amount.');
      return null;
    }
    if (!postingDate) {
      setError('Posting date is required.');
      return null;
    }
    setError(null);
    return tryReadCurrentDraft();
  };

  const addLine = () => {
    const draft = readCurrentDraft();
    if (!draft) return;
    setQueue((prev) => [...prev, draft]);
    setAmount('');
    setNote('');
  };

  const saveEntries = async () => {
    const drafts = [...queue];
    const current = tryReadCurrentDraft();
    if (current) drafts.push(current);
    if (!drafts.length) {
      setError('Select a source, enter an amount, and save — or add lines to the queue first.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const previewRows = buildManualPreviewRows(drafts, partners, commissionImports);
      const parsed = previewRows.map(({ lineIndex, postingDate: pd, description, amount: amt, details, sheetType, sheetSource, origCoName, origId, commissionPeriod }) => ({
        lineIndex, postingDate: pd, description, amount: amt, details, sheetType, sheetSource, origCoName, origId, commissionPeriod,
      }));
      const range = importPeriodRange(parsed);
      const label = drafts.length === 1
        ? `Manual entry — ${sortedPartners.find((p) => p.id === drafts[0]!.partnerId)?.display_name ?? 'deposit'}`
        : `Manual entries (${drafts.length}) — ${new Date().toLocaleDateString('en-US')}`;
      await saveBankDepositImport({
        filename: label,
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
      window.dispatchEvent(new Event('candid-commissions-updated'));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save manual deposit');
    } finally {
      setSaving(false);
    }
  };

  const partnerLabel = (id: number) => {
    const p = partners.find((x) => x.id === id);
    return p ? (p.display_name ?? p.name) : '—';
  };

  const pendingSaveCount = queue.length + (tryReadCurrentDraft() ? 1 : 0);

  return (
    <div className="modal-overlay open bank-classify-overlay" onClick={onClose}>
      <div
        className="modal-box bank-classify-modal"
        style={{ width: 'min(520px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Add deposit manually</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 14 }}>
            Add one or two lines without uploading a spreadsheet — useful when a payment arrives after an import.
          </p>
          <div className="form-group">
            <label>Posting date</label>
            <input type="date" value={postingDate} onChange={(e) => handlePostingDateChange(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Commission period</label>
            <select
              className="comm-period-select"
              style={{ width: '100%' }}
              value={commissionPeriod}
              onChange={(e) => setCommissionPeriod(e.target.value)}
            >
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {formatPeriodLabel(p)}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6, marginBottom: 0 }}>
              Which supplier-report month this deposit applies to. Defaults from posting date; change if the payout belongs to a different period.
            </p>
          </div>
          <div className="form-group">
            <label>Source</label>
            <select
              className="comm-period-select"
              style={{ width: '100%' }}
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">— Select source —</option>
              {sortedPartners.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name ?? p.name}</option>
              ))}
            </select>
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
          <div className="form-group">
            <label>Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="form-group">
            <label>Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Late Telarus payout"
            />
          </div>

          {queue.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 8 }}>
                Queued ({queue.length})
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--gray-dark)' }}>
                {queue.map((line, i) => (
                  <li key={i}>
                    {formatPeriodLabel(line.commissionPeriod)} · {partnerLabel(line.partnerId)} · {line.depositType} · {formatCommissionCurrency(line.amount)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--gray-border)' }}>
          <button type="button" className="admin-ticket-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-ticket-btn" disabled={saving} onClick={addLine}>
            Add line
          </button>
          <button type="button" className="admin-ticket-btn primary" disabled={saving} onClick={() => void saveEntries()}>
            {saving ? 'Saving…' : pendingSaveCount > 1 ? `Save ${pendingSaveCount} lines` : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function parsedRowForReconcile(
  parsed: ParsedChaseRow[],
  previewRow: BankDepositPreviewRow,
): ParsedChaseRow {
  const base = parsed.find((p) => p.lineIndex === previewRow.lineIndex);
  if (!base) {
    return {
      lineIndex: previewRow.lineIndex,
      details: previewRow.details,
      postingDate: previewRow.postingDate,
      description: previewRow.description,
      amount: previewRow.amount,
      sheetType: previewRow.sheetType,
      sheetSource: previewRow.sheetSource,
      origCoName: previewRow.origCoName,
      origId: previewRow.origId,
      commissionPeriod: previewRow.commissionPeriod,
    };
  }
  return { ...base, commissionPeriod: previewRow.commissionPeriod ?? base.commissionPeriod };
}

function reindexPreviewRows(
  rows: BankDepositPreviewRow[],
  partners: PartnerSupplierRecord[],
  commissionImports: SupplierImportBatch[],
): BankDepositPreviewRow[] {
  if (!rows.length) return [];
  const reindexed = rows.map((row, idx) => ({ ...row, lineIndex: idx }));
  const parsed = reindexed.map(
    ({ lineIndex: li, postingDate, description, amount, details, sheetType, sheetSource, origCoName, origId, commissionPeriod }) => ({
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
    }),
  );
  const overrides = new Map(reindexed.map((r) => [r.lineIndex, r]));
  return recomputePreview(parsed, partners, commissionImports, overrides);
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
      row: parsedRowForReconcile(parsed, r),
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

/** Rebuilds editable preview rows from a previously saved import so it can be
 *  re-classified, have lines removed, and saved again. */
function savedLinesToPreview(
  lines: BankDepositLineRecord[],
  partners: PartnerSupplierRecord[],
  commissionImports: SupplierImportBatch[],
): BankDepositPreviewRow[] {
  const parsed: ParsedChaseRow[] = lines.map((l) => ({
    lineIndex: l.line_index,
    details: l.details,
    postingDate: l.posting_date,
    description: l.description,
    amount: Number(l.amount) || 0,
    sheetType: null,
    sheetSource: null,
    origCoName: l.orig_co_name,
    origId: l.orig_id,
    commissionPeriod: l.commission_period,
  }));
  const overrides = new Map<number, Partial<BankDepositPreviewRow>>(
    lines.map((l) => [
      l.line_index,
      {
        depositType: l.deposit_type,
        partnerId: l.partner_supplier_id,
        supplierKey: (l.supplier_key as SupplierId | null) ?? null,
        sourceMatchLabel: l.source_match_label ?? 'Unmatched',
        commissionPeriod: l.commission_period,
      },
    ]),
  );
  return recomputePreview(parsed, partners, commissionImports, overrides);
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
  onRemoveRow,
}: {
  rows: BankDepositPreviewRow[];
  partners: PartnerSupplierRecord[];
  commissionImports: SupplierImportBatch[];
  onRowsChange: (rows: BankDepositPreviewRow[]) => void;
  onClassifyRow: (row: BankDepositPreviewRow) => void;
  onRemoveRow: (lineIndex: number) => void;
}) {
  const updateRow = (lineIndex: number, patch: Partial<BankDepositPreviewRow>) => {
    const nextRows = rows.map((row) => (row.lineIndex === lineIndex ? { ...row, ...patch } : row));
    onRowsChange(reindexPreviewRows(nextRows, partners, commissionImports));
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
            <th>Commission period</th>
            <th>Source match</th>
            <th style={{ textAlign: 'center' }}>Match</th>
            <th style={{ textAlign: 'right' }}>Supplier comm.</th>
            <th style={{ textAlign: 'right' }}>Variance</th>
            <th style={{ textAlign: 'center' }} aria-label="Remove" />
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
                  value={row.commissionPeriod ?? ''}
                  onChange={(e) => updateRow(row.lineIndex, { commissionPeriod: e.target.value || null })}
                >
                  <option value="">—</option>
                  {buildPeriodOptions(commissionImports, row.postingDate, row.commissionPeriod).map((p) => (
                    <option key={p} value={p}>{formatPeriodLabel(p)}</option>
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
              <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="bank-deposit-remove"
                  title="Remove this line from the import"
                  aria-label="Remove line"
                  onClick={() => onRemoveRow(row.lineIndex)}
                >
                  ×
                </button>
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
  const [editingImportId, setEditingImportId] = useState<number | null>(null);
  const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
  const [classifyRow, setClassifyRow] = useState<BankDepositPreviewRow | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
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
      setEditingImportId(null);
      setSelectedImportId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse bank sheet');
    }
  };

  const removePreviewRow = (lineIndex: number) => {
    setPreviewRows((prev) => {
      if (!prev) return prev;
      const remaining = prev.filter((r) => r.lineIndex !== lineIndex);
      return reindexPreviewRows(remaining, partners, commissionImports);
    });
  };

  const handleEditImport = async (imp: BankDepositImportSummary) => {
    setError(null);
    try {
      const lines =
        selectedImportId === imp.id && savedLines.length
          ? savedLines
          : await fetchBankDepositLines(imp.id);
      if (!lines.length) {
        setError('This import has no lines to edit.');
        return;
      }
      const currentPartners = partners.length ? partners : await fetchPartnerSuppliers();
      if (!partners.length) setPartners(currentPartners);
      setPreviewFilename(imp.filename);
      setPreviewRows(savedLinesToPreview(lines, currentPartners, commissionImports));
      setEditingImportId(imp.id);
      setSelectedImportId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load import for editing');
    }
  };

  const cancelPreview = () => {
    setPreviewRows(null);
    setPreviewFilename('');
    setEditingImportId(null);
  };

  const handleSavePreview = async () => {
    if (!previewRows) return;
    if (previewRows.length === 0) {
      setError('At least one line is required. Cancel the edit to discard this import.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const normalized = reindexPreviewRows(previewRows, partners, commissionImports);
      const range = importPeriodRange(normalized);
      const payload = {
        filename: previewFilename,
        periodStart: range.start,
        periodEnd: range.end,
        lines: normalized.map((row) => ({
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
      };
      if (editingImportId) {
        await updateBankDepositImport(editingImportId, payload);
      } else {
        await saveBankDepositImport(payload);
      }
      setPreviewRows(null);
      setPreviewFilename('');
      setEditingImportId(null);
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
        <button
          type="button"
          className="admin-ticket-btn"
          onClick={() => setManualOpen(true)}
        >
          Add manually
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
            <button type="button" className="admin-ticket-btn" onClick={cancelPreview}>
              {editingImportId ? 'Cancel edit' : 'Cancel preview'}
            </button>
            <button
              type="button"
              className="admin-ticket-btn primary"
              disabled={saving || previewRows.length === 0}
              onClick={() => void handleSavePreview()}
            >
              {saving ? 'Saving…' : editingImportId ? 'Save changes' : 'Save import'}
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
            <div className="card-title">{editingImportId ? 'Edit import' : 'Import preview'} — {previewFilename}</div>
            {previewStats && (
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                {previewRows.length} rows · {previewStats.matched} matched · {previewStats.mismatch} variance · {previewStats.noData} no commission data
              </div>
            )}
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {previewRows.length === 0 ? (
              <p style={{ padding: 20, fontSize: 13, color: 'var(--gray)' }}>
                All lines removed. Cancel the edit or add lines before saving.
              </p>
            ) : (
            <PreviewTable
              rows={previewRows}
              partners={partners}
              commissionImports={commissionImports}
              onRowsChange={setPreviewRows}
              onClassifyRow={setClassifyRow}
              onRemoveRow={removePreviewRow}
            />
            )}
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
                No bank imports yet. Upload a Chase activity export or use Add manually to record individual deposits.
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
                            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px 0' }}>
                              <button
                                type="button"
                                className="admin-ticket-btn primary"
                                onClick={(e) => { e.stopPropagation(); void handleEditImport(imp); }}
                              >
                                Edit import
                              </button>
                            </div>
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
            const partnerList = newPartner ? [...partners, newPartner] : partners;
            setPreviewRows((prev) => {
              if (!prev) return prev;
              const next = prev.map((r) => (r.lineIndex === classifyRow.lineIndex ? { ...r, ...patch } : r));
              return reindexPreviewRows(next, partnerList, commissionImports);
            });
            setClassifyRow(null);
          }}
        />
      )}

      {manualOpen && (
        <ManualDepositModal
          partners={partners}
          commissionImports={commissionImports}
          onClose={() => setManualOpen(false)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
}

export default BankDepositsPanel;
