'use client';

import {
  isCompensationTierLine,
  isPartnerFeeLine,
  RESELLER_COMPENSATION_SECTION,
  revenueShareToChoice,
  REVENUE_SHARE_CHOICES,
  type ScheduleARateLine,
} from '@/lib/schedule-a-types';
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

const subHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--gray)',
  padding: '8px 12px',
  background: 'var(--gray-light, #f9fafb)',
  borderBottom: '1px solid var(--gray-border)',
};

function RevenueShareSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (next: string | undefined) => void;
}) {
  const choice = revenueShareToChoice(value);
  return (
    <select
      value={choice}
      onChange={(e) => {
        const next = e.target.value as (typeof REVENUE_SHARE_CHOICES)[number];
        onChange(next === '' ? undefined : next);
      }}
      style={inputStyle}
      aria-label="Revenue share"
    >
      <option value="">Blank</option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </select>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={onClick}>
      Remove
    </button>
  );
}

export function ResellerCompensationBlock({
  lines,
  onUpdateLine,
  onRemoveLine,
  onAddCompensationTier,
  onAddPartnerFee,
}: {
  lines: ScheduleARateLine[];
  onUpdateLine: (id: string, patch: Partial<ScheduleARateLine>) => void;
  onRemoveLine: (id: string) => void;
  onAddCompensationTier: () => void;
  onAddPartnerFee: () => void;
}) {
  const tierLines = lines.filter(isCompensationTierLine);
  const partnerFeeLines = lines.filter(isPartnerFeeLine);

  return (
    <div className="schedule-rate-section schedule-rate-section--reseller">
      <div className="schedule-rate-section-header">
        {RESELLER_COMPENSATION_SECTION}
        <span className="schedule-rate-section-count">
          ({tierLines.length} tier{tierLines.length === 1 ? '' : 's'} · {partnerFeeLines.length} partner fee
          {partnerFeeLines.length === 1 ? '' : 's'})
        </span>
      </div>

      <div className="schedule-rate-section-subblock">
        <div style={subHeaderStyle}>Compensation tiers</div>
        <div className="schedule-rate-table-scroll">
          <table className="admin-mini-table comm-table schedule-rate-lines-table">
            <thead>
              <tr>
                <th className="schedule-rate-col-item">Item</th>
                <th className="schedule-rate-col-revshare">Revenue share</th>
                <th className="schedule-rate-col-tier">Tier applied</th>
                <th className="schedule-rate-col-applied">Applied on</th>
                <th className="schedule-rate-col-actions" />
              </tr>
            </thead>
            <tbody>
              {tierLines.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ fontSize: 12, color: 'var(--gray)', padding: 12 }}>
                    No compensation tier rows yet.
                  </td>
                </tr>
              ) : (
                tierLines.map((line) => (
                  <tr key={line.id} id={`schedule-rate-line-${line.id}`}>
                    <td className="schedule-rate-col-item">
                      <input
                        value={line.item}
                        onChange={(e) => onUpdateLine(line.id, { item: e.target.value })}
                        style={inputStyle}
                      />
                    </td>
                    <td className="schedule-rate-col-revshare">
                      <input
                        value={line.revenueShare ?? ''}
                        onChange={(e) => onUpdateLine(line.id, { revenueShare: e.target.value })}
                        style={inputStyle}
                        placeholder="e.g. 99%"
                      />
                    </td>
                    <td className="schedule-rate-col-tier">
                      <ScheduleFeeMetadataFields
                        tierApplied={line.tierApplied}
                        feeAppliedOn={line.feeAppliedOn}
                        onChange={(patch) => onUpdateLine(line.id, patch)}
                        fields="tier"
                      />
                    </td>
                    <td className="schedule-rate-col-applied">
                      <ScheduleFeeMetadataFields
                        tierApplied={line.tierApplied}
                        feeAppliedOn={line.feeAppliedOn}
                        onChange={(patch) => onUpdateLine(line.id, patch)}
                        fields="appliedOn"
                      />
                    </td>
                    <td className="schedule-rate-col-actions">
                      <RemoveButton onClick={() => onRemoveLine(line.id)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="schedule-rate-section-actions">
          <button type="button" className="btn-secondary" style={{ fontSize: 11 }} onClick={onAddCompensationTier}>
            + Add compensation tier
          </button>
        </div>
      </div>

      <div className="schedule-rate-section-subblock">
        <div style={subHeaderStyle}>
          Partner fees
          <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
            (not used in Our Rate margin calculations)
          </span>
        </div>
        <div className="schedule-rate-table-scroll">
          <table className="admin-mini-table comm-table schedule-rate-lines-table">
            <thead>
              <tr>
                <th className="schedule-rate-col-item">Item</th>
                <th className="schedule-rate-col-rate">Fee $</th>
                <th className="schedule-rate-col-occurrence">Fee occurrence</th>
                <th className="schedule-rate-col-notes">Notes</th>
                <th className="schedule-rate-col-actions" />
              </tr>
            </thead>
            <tbody>
              {partnerFeeLines.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ fontSize: 12, color: 'var(--gray)', padding: 12 }}>
                    No partner fee rows yet.
                  </td>
                </tr>
              ) : (
                partnerFeeLines.map((line) => (
                  <tr key={line.id} id={`schedule-rate-line-${line.id}`}>
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
                        placeholder="$0.00"
                      />
                    </td>
                    <td className="schedule-rate-col-occurrence">
                      <ScheduleFeeMetadataFields
                        feeOccurrence={line.feeOccurrence}
                        onChange={(patch) => onUpdateLine(line.id, patch)}
                        fields="occurrence"
                      />
                    </td>
                    <td className="schedule-rate-col-notes">
                      <input
                        value={line.notes ?? ''}
                        onChange={(e) => onUpdateLine(line.id, { notes: e.target.value })}
                        style={inputStyle}
                      />
                    </td>
                    <td className="schedule-rate-col-actions">
                      <RemoveButton onClick={() => onRemoveLine(line.id)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="schedule-rate-section-actions">
          <button type="button" className="btn-secondary" style={{ fontSize: 11 }} onClick={onAddPartnerFee}>
            + Add partner fee
          </button>
        </div>
      </div>
    </div>
  );
}

export { RevenueShareSelect };
