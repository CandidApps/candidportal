'use client';

import { useMemo, useState } from 'react';
import { dealSplitOverrideFor } from '@/lib/team/internal-commission-engine';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import type {
  DealEmployeeSplit,
  InternalDealSplit,
  PartnerSplitShare,
} from '@/lib/services/internal-deal-splits-db';
import type { TeamSplitLedgerDeal } from '@/lib/team/team-payout-ledger';

export function ModifyTeamSplitModal({
  deal,
  participants,
  dealSplitOverrides,
  onClose,
  onSaved,
}: {
  deal: TeamSplitLedgerDeal;
  participants: InternalCommissionParticipant[];
  dealSplitOverrides: InternalDealSplit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const partners = useMemo(
    () => participants.filter((p) => p.participantType === 'partner' && p.status === 'active'),
    [participants],
  );
  const employees = useMemo(
    () =>
      participants.filter((p) => p.participantType === 'internal_employee' && p.status === 'active'),
    [participants],
  );

  const existingOverride = useMemo(
    () => dealSplitOverrideFor(deal.dealUid, dealSplitOverrides),
    [deal.dealUid, dealSplitOverrides],
  );

  const [label, setLabel] = useState(existingOverride?.label?.trim() ?? '');
  const [partnerSplits, setPartnerSplits] = useState<PartnerSplitShare[]>(() => {
    if (existingOverride?.partnerSplits.length) return existingOverride.partnerSplits;
    return partners.map((p) => ({
      profileId: p.profileId,
      percent: p.defaultHouseSharePercent,
    }));
  });
  const [employeeSplits, setEmployeeSplits] = useState<DealEmployeeSplit[]>(() => {
    if (existingOverride?.employeeSplits.length) return existingOverride.employeeSplits;
    return employees
      .filter((e) => (e.houseShareRateOfNet ?? 0) > 0)
      .map((e) => ({
        profileId: e.profileId,
        percent: e.houseShareRateOfNet ?? 0,
      }));
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const partnerTotal = partnerSplits.reduce((s, p) => s + Math.max(0, p.percent), 0);

  const updatePartnerSplit = (profileId: string, percent: number) => {
    setPartnerSplits((prev) => {
      const others = prev.filter((s) => s.profileId !== profileId);
      return [...others, { profileId, percent }];
    });
  };

  const updateEmployeeSplit = (profileId: string, percent: number) => {
    setEmployeeSplits((prev) => {
      const others = prev.filter((s) => s.profileId !== profileId);
      if (percent <= 0) return others;
      return [...others, { profileId, percent }];
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const activeEmployees = employeeSplits.filter((s) => s.percent > 0);
      const activePartners = partnerSplits.filter((s) => s.percent > 0);
      if (!activePartners.length && !activeEmployees.length) {
        throw new Error('Enter at least one partner or employee split.');
      }

      const res = await fetch('/api/admin/deal-splits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealUid: deal.dealUid,
          label: label.trim() || null,
          partnerSplits: activePartners,
          employeeSplits: activeEmployees,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async () => {
    if (!existingOverride) return;
    if (!window.confirm('Remove the custom split for this deal and revert to defaults?')) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/deal-splits?dealUid=${encodeURIComponent(deal.dealUid)}`,
        { method: 'DELETE' },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Remove failed');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">Modify split — this deal</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{deal.company}</div>
            {deal.serviceTitle ? (
              <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>{deal.serviceTitle}</div>
            ) : null}
          </div>

          <p style={{ fontSize: 12, color: 'var(--gray)', margin: 0, lineHeight: 1.5 }}>
            Override applies to <strong>this deal only</strong>. Other deals keep the default team
            split unless you override them separately.
          </p>

          <label className="settings-field">
            <span className="settings-field-label">Note (optional)</span>
            <input
              className="settings-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Referral bonus split"
            />
          </label>

          {partners.length > 0 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>Partner split</div>
                <div
                  style={{
                    fontSize: 11,
                    color: Math.abs(partnerTotal - 100) < 0.01 ? 'var(--green)' : 'var(--gray)',
                  }}
                >
                  Total {partnerTotal}%
                </div>
              </div>
              {partners.map((p) => {
                const current =
                  partnerSplits.find((s) => s.profileId === p.profileId)?.percent ?? 0;
                return (
                  <label
                    key={p.profileId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ minWidth: 140 }}>{p.displayName}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="settings-input"
                      style={{ width: 90 }}
                      value={current}
                      onChange={(e) =>
                        updatePartnerSplit(p.profileId, Number(e.target.value) || 0)
                      }
                    />
                    <span>%</span>
                    <button
                      type="button"
                      className="assist-mini-btn"
                      onClick={() => updatePartnerSplit(p.profileId, p.defaultHouseSharePercent)}
                    >
                      Default
                    </button>
                  </label>
                );
              })}
            </div>
          )}

          {employees.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                Employee cut (before partner split)
              </div>
              {employees.map((emp) => {
                const current =
                  employeeSplits.find((s) => s.profileId === emp.profileId)?.percent ?? 0;
                return (
                  <label
                    key={emp.profileId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ minWidth: 140 }}>{emp.displayName}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="settings-input"
                      style={{ width: 90 }}
                      value={current}
                      onChange={(e) =>
                        updateEmployeeSplit(emp.profileId, Number(e.target.value) || 0)
                      }
                    />
                    <span>% of house net</span>
                    <button
                      type="button"
                      className="assist-mini-btn"
                      onClick={() =>
                        updateEmployeeSplit(emp.profileId, emp.houseShareRateOfNet ?? 0)
                      }
                    >
                      Default
                    </button>
                  </label>
                );
              })}
            </div>
          )}

          {error ? <div className="settings-form-error">{error}</div> : null}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          {existingOverride ? (
            <button
              type="button"
              className="admin-ticket-btn"
              style={{ color: 'var(--red)' }}
              disabled={saving}
              onClick={() => void removeOverride()}
            >
              Remove override
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="admin-ticket-btn primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save split'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
