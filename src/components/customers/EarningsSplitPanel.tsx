'use client';

import { useMemo } from 'react';
import {
  computeEarnings,
  EARNINGS_MODE_LABEL,
  EARNINGS_MODES,
  isEarningsMode,
  isSellingAgentId,
  type EarningsMode,
  type EarningsSnapshot,
  type MemberTier,
} from '@/lib/earnings/payout-engine';

function pct(n: number): string {
  return `${Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 100) / 100)}%`;
}

/**
 * Admin-only earnings waterfall for a deal: editable earnings mode + resulting customer cash back,
 * agent share and Candid remainder. Dry run — Agent Payments still pay the agent rate field.
 */
export function EarningsSplitPanel({
  candidNetPct,
  memberTier,
  agentCommId,
  agentRatePct,
  earningsMode,
  onEarningsModeChange,
  snapshot,
  inputStyle,
}: {
  candidNetPct: number | null;
  memberTier: MemberTier | null;
  agentCommId: string;
  /** Agent rate field (% of Candid residual $) for comparison. */
  agentRatePct: number | null;
  earningsMode: EarningsMode | '';
  onEarningsModeChange: (next: EarningsMode | '') => void;
  snapshot?: EarningsSnapshot;
  inputStyle: React.CSSProperties;
}) {
  const tier: MemberTier = memberTier ?? 'basic';
  const hasAgent = isSellingAgentId(agentCommId);
  const result = useMemo(
    () =>
      candidNetPct != null && candidNetPct > 0
        ? computeEarnings({
            candidNetPct,
            memberTier: tier,
            hasAgent,
            earningsMode: isEarningsMode(earningsMode) ? earningsMode : null,
          })
        : null,
    [candidNetPct, tier, hasAgent, earningsMode],
  );

  const agentRateDiffers =
    result != null &&
    hasAgent &&
    agentRatePct != null &&
    Math.abs(agentRatePct - result.agentRateOfCandidResidualPct) >= 0.01;

  return (
    <div className="earnings-split-panel">
      <div className="earnings-split-head">
        <div>
          <div className="earnings-split-title">Earnings split</div>
          <div className="earnings-split-sub">
            {memberTier ? `${tier === 'paid' ? 'Paid' : 'Basic'} member` : 'Member tier unknown — Basic assumed'}
            {' · '}
            {hasAgent ? 'Selling agent on deal' : 'No selling agent'}
          </div>
        </div>
        <label className="earnings-split-mode">
          <span>Earnings mode</span>
          <select
            value={earningsMode}
            onChange={(e) => onEarningsModeChange((e.target.value as EarningsMode) || '')}
            style={{ ...inputStyle, width: 220 }}
          >
            <option value="">
              Auto{result ? ` — ${EARNINGS_MODE_LABEL[result.defaultEarningsMode]}` : ''}
            </option>
            {EARNINGS_MODES.map((m) => (
              <option key={m} value={m}>
                {EARNINGS_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {result ? (
        <>
          <div className="earnings-split-grid">
            <div>
              <span>Candid net</span>
              <strong>{pct(result.candidNetPct)}</strong>
            </div>
            <div>
              <span>Customer cash back</span>
              <strong>{result.customerCashBackPct > 0 ? pct(result.customerCashBackPct) : 'None'}</strong>
              <em>{result.customerSharePct}% of net, floored to 0.5</em>
            </div>
            <div>
              <span>Agent</span>
              <strong>{result.agentPct > 0 ? pct(result.agentPct) : 'None'}</strong>
              {result.agentPct > 0 ? <em>{pct(result.agentRateOfCandidResidualPct)} of Candid residual</em> : null}
            </div>
            <div>
              <span>Candid keeps</span>
              <strong>{pct(result.candidRemainderPct)}</strong>
            </div>
          </div>
          {result.notes.length ? (
            <ul className="earnings-split-notes">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          <p className="earnings-split-foot">
            Dry run — locked on save. Agent Payments still use the agent rate field
            {agentRateDiffers ? ` (${pct(agentRatePct!)} vs engine ${pct(result.agentRateOfCandidResidualPct)})` : ''}.
            {snapshot ? ` Last locked ${new Date(snapshot.lockedAt).toLocaleDateString()}.` : ''}
          </p>
        </>
      ) : (
        <p className="earnings-split-foot">Enter a Candid commission rate to see the split.</p>
      )}
    </div>
  );
}
