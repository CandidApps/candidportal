'use client';

import {
  groupScheduleALinesBySection,
  isResellerCompensationSection,
  normalizeScheduleASection,
  scheduleASectionOptions,
  type ScheduleARateLine,
} from '@/lib/schedule-a-types';
import { FeeRateMatchIcon } from '@/components/admin/FeeRateMatchIcon';
import { ResellerCompensationBlock, RevenueShareSelect } from '@/components/suppliers/ResellerCompensationBlock';
import { ScheduleFeeMetadataFields } from '@/components/suppliers/ScheduleFeeMetadataFields';

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  boxSizing: 'border-box',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--gray-dark)',
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  padding: '10px 12px',
  background: 'var(--gray-bg, #f3f4f6)',
  borderBottom: '1px solid var(--gray-border)',
};

export function SupplierRateLinesTable({
  lines,
  onUpdateLine,
  onRemoveLine,
  emptyMessage = 'No rate lines yet.',
  rateColumnLabel = 'Buy rate',
  matchedRateLineIds,
  matchedFeeLabelByLineId,
  highlightedLineId,
  showFeeMetadata = false,
  onAddCompensationTier,
  onAddPartnerFee,
}: {
  lines: ScheduleARateLine[];
  onUpdateLine: (id: string, patch: Partial<ScheduleARateLine>) => void;
  onRemoveLine: (id: string) => void;
  emptyMessage?: string;
  rateColumnLabel?: string;
  matchedRateLineIds?: ReadonlySet<string>;
  matchedFeeLabelByLineId?: ReadonlyMap<string, string>;
  highlightedLineId?: string | null;
  showFeeMetadata?: boolean;
  onAddCompensationTier?: () => void;
  onAddPartnerFee?: () => void;
}) {
  const resellerLines = lines.filter((line) => isResellerCompensationSection(line.section));
  const standardLines = lines.filter((line) => !isResellerCompensationSection(line.section));
  const showMatchColumn = Boolean(matchedRateLineIds?.size);

  if (lines.length === 0 && !(showFeeMetadata && onAddCompensationTier && onAddPartnerFee)) {
    return <p style={{ fontSize: 13, color: 'var(--gray)' }}>{emptyMessage}</p>;
  }

  const sectionOptions = scheduleASectionOptions(lines);
  const grouped = groupScheduleALinesBySection(standardLines);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showFeeMetadata && onAddCompensationTier && onAddPartnerFee && (
        <ResellerCompensationBlock
          lines={resellerLines}
          onUpdateLine={onUpdateLine}
          onRemoveLine={onRemoveLine}
          onAddCompensationTier={onAddCompensationTier}
          onAddPartnerFee={onAddPartnerFee}
        />
      )}

      {grouped.map(({ section, lines: sectionLines }) => (
        <div key={section} className="schedule-rate-section">
          <div style={sectionHeaderStyle}>
            {section}
            <span style={{ fontWeight: 500, color: 'var(--gray)', marginLeft: 8, textTransform: 'none' }}>
              ({sectionLines.length} line{sectionLines.length === 1 ? '' : 's'}
              {showMatchColumn
                ? ` · ${sectionLines.filter((l) => matchedRateLineIds?.has(l.id)).length} matched`
                : ''}
              )
            </span>
          </div>
          <div className="schedule-rate-table-scroll">
            <table className="admin-mini-table comm-table schedule-rate-lines-table">
              <thead>
                <tr>
                  {showMatchColumn && <th className="schedule-rate-col-match" aria-label="Fee match" />}
                  <th className="schedule-rate-col-item">Item</th>
                  <th className="schedule-rate-col-rate">{rateColumnLabel}</th>
                  <th className="schedule-rate-col-revshare">Revenue share</th>
                  {showFeeMetadata && (
                    <>
                      <th className="schedule-rate-col-occurrence">Fee occurrence</th>
                      <th className="schedule-rate-col-applied">Fee applied on</th>
                      <th className="schedule-rate-col-tier">Tier applied</th>
                    </>
                  )}
                  <th className="schedule-rate-col-notes">Notes</th>
                  <th className="schedule-rate-col-section">Section</th>
                  <th className="schedule-rate-col-actions" />
                </tr>
              </thead>
              <tbody>
                {sectionLines.map((line) => {
                  const isMatched = matchedRateLineIds?.has(line.id) ?? false;
                  const isHighlighted = highlightedLineId === line.id;
                  const feeLabel = matchedFeeLabelByLineId?.get(line.id);
                  return (
                    <tr
                      key={line.id}
                      id={`schedule-rate-line-${line.id}`}
                      className={[
                        isMatched ? 'schedule-rate-line--matched' : '',
                        isHighlighted ? 'schedule-rate-line--highlight' : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined}
                    >
                      {showMatchColumn && (
                        <td className="schedule-rate-col-match" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          {isMatched ? (
                            <FeeRateMatchIcon
                              title={
                                feeLabel
                                  ? `Matches current fee: ${feeLabel}`
                                  : 'Matches a current fee on the statement'
                              }
                            />
                          ) : null}
                        </td>
                      )}
                      <td className="schedule-rate-col-item">
                        <input
                          value={line.item}
                          onChange={(e) => onUpdateLine(line.id, { item: e.target.value })}
                          style={inputStyle}
                        />
                      </td>
                      <td className="schedule-rate-col-rate">
                        <input
                          value={line.buyRate}
                          onChange={(e) => onUpdateLine(line.id, { buyRate: e.target.value })}
                          style={inputStyle}
                        />
                      </td>
                      <td className="schedule-rate-col-revshare">
                        {showFeeMetadata ? (
                          <RevenueShareSelect
                            value={line.revenueShare}
                            onChange={(next) => onUpdateLine(line.id, { revenueShare: next })}
                          />
                        ) : (
                          <input
                            value={line.revenueShare ?? ''}
                            onChange={(e) => onUpdateLine(line.id, { revenueShare: e.target.value })}
                            style={inputStyle}
                            placeholder="—"
                          />
                        )}
                      </td>
                      {showFeeMetadata && (
                        <>
                          <td className="schedule-rate-col-occurrence">
                            <ScheduleFeeMetadataFields
                              feeOccurrence={line.feeOccurrence}
                              feeAppliedOn={line.feeAppliedOn}
                              tierApplied={line.tierApplied}
                              onChange={(patch) => onUpdateLine(line.id, patch)}
                              fields="occurrence"
                            />
                          </td>
                          <td className="schedule-rate-col-applied">
                            <ScheduleFeeMetadataFields
                              feeOccurrence={line.feeOccurrence}
                              feeAppliedOn={line.feeAppliedOn}
                              tierApplied={line.tierApplied}
                              onChange={(patch) => onUpdateLine(line.id, patch)}
                              fields="appliedOn"
                            />
                          </td>
                          <td className="schedule-rate-col-tier">
                            <ScheduleFeeMetadataFields
                              feeOccurrence={line.feeOccurrence}
                              feeAppliedOn={line.feeAppliedOn}
                              tierApplied={line.tierApplied}
                              onChange={(patch) => onUpdateLine(line.id, patch)}
                              fields="tier"
                            />
                          </td>
                        </>
                      )}
                      <td className="schedule-rate-col-notes">
                        <input
                          value={line.notes ?? ''}
                          onChange={(e) => onUpdateLine(line.id, { notes: e.target.value })}
                          style={inputStyle}
                        />
                      </td>
                      <td className="schedule-rate-col-section">
                        <select
                          value={normalizeScheduleASection(line.section)}
                          onChange={(e) => onUpdateLine(line.id, { section: e.target.value })}
                          style={inputStyle}
                          aria-label={`Section for ${line.item || 'line item'}`}
                        >
                          {sectionOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="schedule-rate-col-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '4px 8px' }}
                          onClick={() => onRemoveLine(line.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
