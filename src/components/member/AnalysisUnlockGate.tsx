'use client';

import React, { useState } from 'react';
import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import { monthlyFeesCents } from '@/lib/candid-pay/merchant-analysis';

type AnalysisUnlockGateProps = {
  snapshot: MerchantAnalysisSnapshot;
  unlockPrice?: number;
  onUnlockPayment?: () => void;
  onScheduleMeeting?: () => void;
  children: React.ReactNode;
};

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function AnalysisUnlockGate({
  snapshot,
  unlockPrice = 25,
  onUnlockPayment,
  onScheduleMeeting,
  children,
}: AnalysisUnlockGateProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const feesCents = monthlyFeesCents(snapshot) ?? 200000;
  const monthlyFees = feesCents / 100;
  const estAnnualSavings = Math.round(monthlyFees * 0.12 * 12) || 2400;
  const roiDays = estAnnualSavings > 0 ? Math.max(1, Math.ceil((unlockPrice / (estAnnualSavings / 365)))) : 1;

  return (
    <div className="analysis-gate-wrap">
      <div className="analysis-gate-preview">
        <div className="analysis-gate-savings-banner">
          <div className="analysis-gate-savings-label">Estimated savings found</div>
          <div className="analysis-gate-savings-value">{fmtMoney(estAnnualSavings / 12)}/mo</div>
          <div className="analysis-gate-savings-sub">
            Full breakdown, pricing options, and contract details are available with Candid Intelligence.
          </div>
        </div>
        <div className="analysis-gate-blur">{children}</div>
        <div className="analysis-gate-fade" />
        <button
          type="button"
          className="analysis-gate-cta"
          onClick={() => setModalOpen(true)}
        >
          Unlock full analysis →
        </button>
      </div>

      {modalOpen && (
        <div
          className="modal-overlay open"
          style={{ zIndex: 900 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="modal-box"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-header-left">
                <div>
                  <div className="modal-title">Unlock your full savings report</div>
                  <div className="modal-subtitle">One-time access · full platform preview</div>
                </div>
              </div>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ padding: '22px 26px' }}>
              <div className="analysis-gate-modal-stat">
                <span>Average return on investment</span>
                <strong>{roiDays === 1 ? '1 day' : `${roiDays} days`}</strong>
              </div>
              <p style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.6, margin: '0 0 18px' }}>
                Get the complete CandidPay proposal, trend analysis, fee flags, and ongoing monitoring —
                the same view our paid clients use every month.
              </p>
              <ul className="analysis-gate-feature-list">
                <li>Line-by-line fee analysis and hidden charge detection</li>
                <li>Side-by-side pricing options with projected savings</li>
                <li>Ask Hank questions about your statement</li>
                <li>Contract tracking and renewal alerts</li>
              </ul>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  className="login-btn"
                  onClick={() => {
                    onUnlockPayment?.();
                    setModalOpen(false);
                  }}
                >
                  Unlock savings now — ${unlockPrice}
                </button>
                <button
                  type="button"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 6,
                    border: '1px solid var(--gray-border)',
                    background: 'var(--white)',
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: 'var(--gray-dark)',
                  }}
                  onClick={() => {
                    onScheduleMeeting?.();
                    setModalOpen(false);
                  }}
                >
                  Schedule a discovery call
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
