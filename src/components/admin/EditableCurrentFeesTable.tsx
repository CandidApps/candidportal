'use client';

import { groupScheduleALinesBySection } from '@/lib/schedule-a-types';
import type { CurrentFeeLine } from '@/lib/analysis/types';

function parseAmountInput(raw: string, line: CurrentFeeLine): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (line.id === 'fee-effective-rate') {
    const n = parseFloat(t.replace(/%/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(t.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatAmountLabel(line: CurrentFeeLine, amount: number): string {
  if (line.id === 'fee-effective-rate') return `${amount.toFixed(2)}%`;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo`;
}

export function EditableCurrentFeesTable({
  lines,
  disabled,
  onChange,
  onNavigateToRateLine,
}: {
  lines: CurrentFeeLine[];
  disabled?: boolean;
  onChange: (next: CurrentFeeLine[]) => void;
  onNavigateToRateLine?: (rateLineId: string) => void;
}) {
  if (!lines.length) {
    return (
      <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0 }}>
        No structured fee breakdown was extracted. Try another statement or edit totals after parse.
      </p>
    );
  }

  const grouped = groupScheduleALinesBySection(
    lines.map((l) => ({
      id: l.id,
      section: l.section,
      item: l.item,
      buyRate: l.amountLabel,
      notes: l.matchedRateItem ? `Matches: ${l.matchedRateItem}` : undefined,
    })),
  );

  const updateLine = (id: string, amount: number) => {
    onChange(
      lines.map((l) =>
        l.id === id ? { ...l, amount, amountLabel: formatAmountLabel(l, amount) } : l,
      ),
    );
  };

  return (
    <div className="current-fees-review-table">
      <p className="current-fees-jump-hint" style={{ marginTop: 0 }}>
        Adjust amounts if parsing missed a fee line. Changes update savings estimates below.
      </p>
      {onNavigateToRateLine && lines.some((l) => l.matchedRateLineId) ? (
        <p className="current-fees-jump-hint">
          Click a green match to jump to that line in Our rate schedule →
        </p>
      ) : null}
      {grouped.map(({ section, lines: sectionLines }) => (
        <div key={section} className="current-fees-section">
          <div className="current-fees-section-title">{section}</div>
          <table className="current-fees-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Current (editable)</th>
                <th>Our rate match</th>
              </tr>
            </thead>
            <tbody>
              {sectionLines.map((line) => {
                const source = lines.find((l) => l.id === line.id);
                const matched = Boolean(source?.matchedRateLineId);
                return (
                  <tr key={line.id} className={matched ? 'current-fee-row--matched' : undefined}>
                    <td>{line.item}</td>
                    <td className="current-fee-amount">
                      <input
                        className="form-input"
                        style={{ maxWidth: 140, padding: '4px 8px', fontSize: 13 }}
                        disabled={disabled}
                        defaultValue={
                          source?.id === 'fee-effective-rate'
                            ? String(source.amount)
                            : source?.amount.toFixed(2) ?? ''
                        }
                        key={`${source?.id}-${source?.amount}`}
                        onBlur={(e) => {
                          if (!source) return;
                          const n = parseAmountInput(e.target.value, source);
                          if (n !== null && n !== source.amount) updateLine(source.id, n);
                        }}
                        aria-label={`${source?.item ?? line.item} amount`}
                      />
                    </td>
                    <td>
                      {matched && source?.matchedRateLineId ? (
                        onNavigateToRateLine ? (
                          <button
                            type="button"
                            className="current-fee-match-link"
                            onClick={() => onNavigateToRateLine(source.matchedRateLineId!)}
                            title={`Jump to ${source.matchedRateItem ?? 'matching rate'} in Our rate schedule`}
                          >
                            ✓ {source.matchedRateItem}
                          </button>
                        ) : (
                          <span className="current-fee-match-badge">✓ {source.matchedRateItem}</span>
                        )
                      ) : (
                        <span style={{ color: 'var(--gray)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
