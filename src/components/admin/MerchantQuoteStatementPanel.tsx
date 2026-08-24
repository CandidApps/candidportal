'use client';

import { useState } from 'react';
import { parseBillFromFile } from '@/lib/bill-parse';
import type { QuoteMerchantSnapshot } from '@/lib/quotes/types';
import {
  applyFeeLinesToStatements,
  quoteMerchantSnapshotFromParse,
} from '@/lib/quotes/merchant-quote-statement';
import { buildCurrentFeeLines } from '@/lib/analysis/current-fee-breakdown';
import type { ScheduleARateLine } from '@/lib/schedule-a-types';
import { EditableCurrentFeesTable } from '@/components/admin/EditableCurrentFeesTable';
import { DocumentEmbed } from '@/components/admin/DocumentEmbed';

export function MerchantQuoteStatementPanel({
  value,
  ourRateLines,
  disabled,
  onChange,
  onNavigateToRateLine,
}: {
  value?: QuoteMerchantSnapshot | null;
  ourRateLines: ScheduleARateLine[];
  disabled?: boolean;
  onChange: (next: QuoteMerchantSnapshot | undefined) => void;
  onNavigateToRateLine?: (rateLineId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openDocIdx, setOpenDocIdx] = useState(0);

  const onFile = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const parseResult = await parseBillFromFile(file, value?.vendorName);
      if (parseResult.category !== 'merchant_services' || !parseResult.merchantStatement) {
        setError(
          parseResult.category
            ? `This bill was classified as ${parseResult.categoryLabel ?? parseResult.category}, not merchant processing. Upload a card processing statement.`
            : 'Could not parse this file as a merchant statement.',
        );
        return;
      }
      const snap = quoteMerchantSnapshotFromParse(parseResult, file.name, ourRateLines);
      if (!snap) {
        setError('No merchant fee data was extracted from this statement.');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      const sourceDoc = {
        name: file.name,
        url: previewUrl,
        mimeType: file.type || undefined,
      };
      if (value?.statements?.length) {
        const statements = [...value.statements, ...snap.statements];
        const filenames = [value.filename, snap.filename].filter(Boolean).join(' · ');
        const sourceDocuments = [...(value.sourceDocuments ?? []), sourceDoc];
        onChange({
          vendorName: value.vendorName || snap.vendorName,
          filename: filenames,
          statements,
          currentFeeLines: buildCurrentFeeLines(statements, ourRateLines),
          sourceDocuments,
        });
        setOpenDocIdx(sourceDocuments.length - 1);
      } else {
        onChange({ ...snap, sourceDocuments: [sourceDoc] });
        setOpenDocIdx(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed');
    } finally {
      setBusy(false);
    }
  };

  const onFeeLinesChange = (feeLines: QuoteMerchantSnapshot['currentFeeLines']) => {
    if (!value?.statements?.length) return;
    const statements = applyFeeLinesToStatements(value.statements, feeLines);
    onChange({
      ...value,
      statements,
      currentFeeLines: buildCurrentFeeLines(statements, ourRateLines),
    });
  };

  const totalFees = value?.statements?.reduce((s, st) => s + (Number(st.totalFees) || 0), 0) ?? 0;
  const totalVolume = value?.statements?.reduce((s, st) => s + (Number(st.totalVolume) || 0), 0) ?? 0;
  const stmtCount = value?.statements?.length ?? 0;
  const avgFees = stmtCount > 0 ? totalFees / stmtCount : 0;
  const avgVolume = stmtCount > 0 ? totalVolume / stmtCount : 0;
  const blendedRate = totalVolume > 0 ? (totalFees / totalVolume) * 100 : 0;
  const docs = value?.sourceDocuments ?? [];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">Current processing (statement)</div>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55, marginTop: 0 }}>
          Upload one or more merchant statements. Fees and volume are blended across statements
          (totals summed; effective rate = total fees ÷ total volume). After you select pricing
          structures below, the published quote shows current vs proposed savings.
        </p>
        <label className="form-group">
          <span className="form-label">Statement (PDF or image) — add multiple</span>
          <input
            className="form-input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            disabled={disabled || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = '';
            }}
          />
        </label>
        {busy ? <p className="text-muted">Parsing statement…</p> : null}
        {error ? (
          <p className="text-danger" style={{ fontSize: 13 }}>
            {error}
          </p>
        ) : null}
        {value?.statements?.length ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: docs.length ? 'minmax(0, 1fr) minmax(260px, 0.9fr)' : '1fr',
              gap: 16,
              alignItems: 'start',
              marginBottom: 12,
            }}
          >
            <div>
              <p style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>{value.vendorName ?? 'Processor'}</strong>
                {value.filename ? ` · ${value.filename}` : null}
                <span style={{ color: 'var(--gray)' }}>
                  {' '}
                  · {value.statements.length} statement{value.statements.length === 1 ? '' : 's'}
                </span>
                {!disabled ? (
                  <button
                    type="button"
                    className="btn-link"
                    style={{ marginLeft: 12, fontSize: 13 }}
                    onClick={() => onChange(undefined)}
                  >
                    Remove all
                  </button>
                ) : null}
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--surface-muted, #f8f8f8)',
                  border: '1px solid var(--gray-border, #e5e5e5)',
                  fontSize: 13,
                  marginBottom: 10,
                }}
              >
                <span>
                  Total fees: <strong>${totalFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                </span>
                <span>
                  Total volume:{' '}
                  <strong>${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                </span>
                <span>
                  Blended effective rate: <strong>{blendedRate.toFixed(2)}%</strong>
                </span>
                {stmtCount > 1 ? (
                  <>
                    <span>
                      Avg fees / stmt:{' '}
                      <strong>${avgFees.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </span>
                    <span>
                      Avg volume / stmt:{' '}
                      <strong>${avgVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </span>
                  </>
                ) : null}
              </div>
              {value.statements.length > 1 ? (
                <details open style={{ marginBottom: 10, fontSize: 12 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                    Statement-by-statement breakdown
                  </summary>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
                    {value.statements.map((st, i) => (
                      <li key={i}>
                        #{i + 1}
                        {st.statementDate ? ` (${st.statementDate})` : ''}: fees $
                        {(Number(st.totalFees) || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                        , volume $
                        {(Number(st.totalVolume) || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                        {Number(st.totalVolume) > 0
                          ? ` · ${(((Number(st.totalFees) || 0) / Number(st.totalVolume)) * 100).toFixed(2)}%`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {value?.currentFeeLines?.length ? (
                <EditableCurrentFeesTable
                  lines={value.currentFeeLines}
                  disabled={disabled}
                  onChange={onFeeLinesChange}
                  onNavigateToRateLine={onNavigateToRateLine}
                />
              ) : null}
            </div>
            {docs.length > 0 ? (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--gray-dark)' }}>
                  Uploaded statements
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {docs.map((doc, i) => {
                    const open = openDocIdx === i;
                    return (
                      <details
                        key={`${doc.name}-${i}`}
                        open={open}
                        onToggle={(e) => {
                          if ((e.target as HTMLDetailsElement).open) setOpenDocIdx(i);
                        }}
                        style={{
                          border: '1px solid var(--gray-border, #e5e5e5)',
                          borderRadius: 8,
                          overflow: 'hidden',
                          background: '#fff',
                        }}
                      >
                        <summary
                          style={{
                            cursor: 'pointer',
                            padding: '8px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'var(--surface-muted, #f8f8f8)',
                          }}
                        >
                          {doc.name || `Statement ${i + 1}`}
                        </summary>
                        {open ? (
                          <div style={{ maxHeight: 420, overflow: 'auto' }}>
                            <DocumentEmbed
                              url={doc.url}
                              title={doc.name}
                              filename={doc.name}
                              mimeType={doc.mimeType}
                            />
                          </div>
                        ) : null}
                      </details>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
