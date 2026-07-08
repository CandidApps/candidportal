'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import { EditTeamMemberModal } from '@/components/team/EditTeamMemberModal';
import { attributedDealsForMember } from '@/lib/team/internal-commission-engine';
import { formatCommissionCurrency, formatPeriodLabel, currentPeriod } from '@/lib/commissions/commission-store';
import { fetchSupplierCommissions } from '@/lib/services/supplier-commissions';
import { mergeManualBatches } from '@/lib/commissions/manual-imports';
import { agentCommissionPeriods } from '@/lib/commissions/period-utils';
import type { SupplierImportBatch } from '@/lib/commissions/supplier-config';
import type { AgentSourcingRule } from '@/lib/services/internal-agent-sourcing-db';

function roleLabel(type: InternalCommissionParticipant['participantType']): string {
  if (type === 'internal_employee') return 'Internal employee';
  if (type === 'inactive') return 'Not on commission';
  return 'Partner';
}

export function TeamMemberDetailPage({
  member,
  participants,
  sourcingRules = [],
  onBack,
  onRefresh,
  onSelectCustomer,
}: {
  member: InternalCommissionParticipant;
  participants: InternalCommissionParticipant[];
  sourcingRules?: AgentSourcingRule[];
  onBack: () => void;
  onRefresh: () => void;
  onSelectCustomer?: (customerId: string) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [imports, setImports] = useState<SupplierImportBatch[]>([]);
  const period = currentPeriod();

  const loadDeals = useCallback(async () => {
    try {
      const periods = agentCommissionPeriods(period);
      const { batches } = await fetchSupplierCommissions({ periods });
      setImports(mergeManualBatches(batches));
    } catch {
      setImports([]);
    }
  }, [period]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  const attributedDeals = useMemo(
    () => attributedDealsForMember(imports, period, participants, member.profileId, sourcingRules),
    [imports, period, participants, member.profileId, sourcingRules],
  );

  const periodTotal = useMemo(
    () => attributedDeals.reduce((s, d) => s + d.amount, 0),
    [attributedDeals],
  );

  const handleSaved = () => {
    onRefresh();
    setEditOpen(false);
  };

  return (
    <div>
      <button type="button" className="btn-secondary" style={{ marginBottom: 16, fontSize: 12 }} onClick={onBack}>
        ← Back to team
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="card-title">{member.displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>{member.email}</div>
            {member.notes && (
              <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8 }}>{member.notes}</div>
            )}
          </div>
          <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditOpen(true)}>
            Edit member
          </button>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Role</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{roleLabel(member.participantType)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Status</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, textTransform: 'capitalize' }}>{member.status}</div>
            </div>
            {member.participantType === 'partner' && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>House share</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{member.defaultHouseSharePercent}%</div>
              </div>
            )}
            {member.participantType === 'internal_employee' && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Rate of house net</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                  {member.houseShareRateOfNet ?? 0}%
                </div>
              </div>
            )}
            {member.optionalAgentCommId && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Linked agent ID</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {member.optionalAgentCommId}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title" style={{ fontSize: 14 }}>House split rules</div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0, lineHeight: 1.5 }}>
            {member.participantType === 'partner' ? (
              <>
                Default share is <strong>{member.defaultHouseSharePercent}%</strong> of house net after
                external agents. Per-agent sourcing overrides (set on Internal team) take priority when
                a deal&apos;s primary agent has a custom partner split.
              </>
            ) : member.participantType === 'internal_employee' ? (
              <>
                This member receives <strong>{member.houseShareRateOfNet ?? 0}%</strong> of house net
                before the partner split.
              </>
            ) : (
              <>This member is not currently included in commission splits.</>
            )}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title" style={{ fontSize: 14 }}>
            Attributed deals — {formatPeriodLabel(period)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray)', fontFamily: 'var(--font-mono)' }}>
            {formatCommissionCurrency(periodTotal)}
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {attributedDeals.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)', padding: 16, margin: 0 }}>
              No house-net attribution for this period yet. Deals appear after supplier imports and
              external agent payouts leave a house remainder.
            </p>
          ) : (
            <table className="admin-mini-table comm-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Supplier</th>
                  <th>External agent</th>
                  <th style={{ textAlign: 'right' }}>House net</th>
                  <th style={{ textAlign: 'right' }}>Share</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Rule</th>
                </tr>
              </thead>
              <tbody>
                {attributedDeals.map((d) => (
                  <tr key={`${d.dealUid}-${d.supplier}`}>
                    <td>
                      {onSelectCustomer ? (
                        <button
                          type="button"
                          className="assist-mini-btn"
                          style={{ padding: 0, border: 'none', background: 'none', color: 'var(--red)' }}
                          onClick={() => onSelectCustomer(d.dealUid)}
                        >
                          {d.company}
                        </button>
                      ) : (
                        d.company
                      )}
                    </td>
                    <td>{d.supplier}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray)' }}>{d.primaryAgentName}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {formatCommissionCurrency(d.houseNet)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {d.sharePercent.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {formatCommissionCurrency(d.amount)}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--gray)' }}>{d.ruleLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editOpen && (
        <EditTeamMemberModal
          member={member}
          onClose={() => setEditOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
