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
      onChange(snap);
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

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">Current processing (statement)</div>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55, marginTop: 0 }}>
          Upload the customer&apos;s merchant statement to populate current spend. After you select pricing
          structures below, the published quote shows current vs proposed savings (same as bill analysis).
        </p>
        <label className="form-group">
          <span className="form-label">Statement (PDF or image)</span>
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
        {value?.filename ? (
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            <strong>{value.vendorName ?? 'Processor'}</strong>
            {value.filename ? ` · ${value.filename}` : null}
            {!disabled ? (
              <button
                type="button"
                className="btn-link"
                style={{ marginLeft: 12, fontSize: 13 }}
                onClick={() => onChange(undefined)}
              >
                Remove
              </button>
            ) : null}
          </p>
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
    </div>
  );
}
