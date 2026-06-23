'use client';

import {
  groupScheduleALinesBySection,
  normalizeScheduleASection,
  scheduleASectionOptions,
  type ScheduleARateLine,
} from '@/lib/schedule-a-types';
import { FeeRateMatchIcon } from '@/components/admin/FeeRateMatchIcon';

const inputStyle: React.CSSProperties = {
  width: '100%',
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
}: {
  lines: ScheduleARateLine[];
  onUpdateLine: (id: string, patch: Partial<ScheduleARateLine>) => void;
  onRemoveLine: (id: string) => void;
  emptyMessage?: string;
  rateColumnLabel?: string;
  /** Rate line IDs that match a parsed current fee (analysis review). */
  matchedRateLineIds?: ReadonlySet<string>;
  matchedFeeLabelByLineId?: ReadonlyMap<string, string>;
  highlightedLineId?: string | null;
}) {
  if (lines.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--gray)' }}>{emptyMessage}</p>;
  }

  const sectionOptions = scheduleASectionOptions(lines);
  const grouped = groupScheduleALinesBySection(lines);
  const showMatchColumn = Boolean(matchedRateLineIds?.size);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {grouped.map(({ section, lines: sectionLines }) => (
        <div
          key={section}
          style={{
            border: '1px solid var(--gray-border)',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'var(--white)',
          }}
        >
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
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-mini-table comm-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  {showMatchColumn && <th style={{ width: 36 }} aria-label="Fee match" />}
                  <th>Item</th>
                  <th>{rateColumnLabel}</th>
                  <th>Revenue share</th>
                  <th>Notes</th>
                  <th style={{ width: 148 }}>Section</th>
                  <th style={{ width: 72 }} />
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
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
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
                    <td>
                      <input value={line.item} onChange={(e) => onUpdateLine(line.id, { item: e.target.value })} style={inputStyle} />
                    </td>
                    <td>
                      <input value={line.buyRate} onChange={(e) => onUpdateLine(line.id, { buyRate: e.target.value })} style={inputStyle} />
                    </td>
                    <td>
                      <input
                        value={line.revenueShare ?? ''}
                        onChange={(e) => onUpdateLine(line.id, { revenueShare: e.target.value })}
                        style={inputStyle}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <input value={line.notes ?? ''} onChange={(e) => onUpdateLine(line.id, { notes: e.target.value })} style={inputStyle} />
                    </td>
                    <td>
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
                    <td>
                      <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onRemoveLine(line.id)}>
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
