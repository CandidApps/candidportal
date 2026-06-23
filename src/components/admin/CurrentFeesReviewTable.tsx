'use client';

import { groupScheduleALinesBySection } from '@/lib/schedule-a-types';
import type { CurrentFeeLine } from '@/lib/analysis/types';

export function CurrentFeesReviewTable({
  lines,
  onNavigateToRateLine,
}: {
  lines: CurrentFeeLine[];
  onNavigateToRateLine?: (rateLineId: string) => void;
}) {
  if (!lines.length) {
    return (
      <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0 }}>
        No structured fee breakdown was extracted from this statement. Check the summary below or re-parse the bill.
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

  return (
    <div className="current-fees-review-table">
      {onNavigateToRateLine && lines.some((l) => l.matchedRateLineId) && (
        <p className="current-fees-jump-hint">
          Click a green match to jump to that line in Our rate schedule →
        </p>
      )}
      {grouped.map(({ section, lines: sectionLines }) => (
        <div key={section} className="current-fees-section">
          <div className="current-fees-section-title">{section}</div>
          <table className="current-fees-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Current</th>
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
                    <td className="current-fee-amount">{source?.amountLabel ?? line.buyRate}</td>
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
