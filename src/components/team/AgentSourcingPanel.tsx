'use client';

import { useMemo, useState } from 'react';
import { resolveAgentMergeKey, getBmwAgentRates } from '@/lib/bmw/deal-master';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import type { AgentSourcingRule, PartnerSplitShare } from '@/lib/services/internal-agent-sourcing-db';

function agentLabelForMergeKey(mergeKey: string, agents: ReturnType<typeof getBmwAgentRates>): string {
  const match = agents.find((a) => resolveAgentMergeKey(a.id) === mergeKey);
  return match?.name ?? mergeKey;
}

export function AgentSourcingPanel({
  participants,
  rules,
  onChanged,
}: {
  participants: InternalCommissionParticipant[];
  rules: AgentSourcingRule[];
  onChanged: () => void;
}) {
  const agents = useMemo(
    () =>
      getBmwAgentRates()
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const partners = participants.filter((p) => p.participantType === 'partner' && p.status === 'active');

  const [agentMergeKey, setAgentMergeKey] = useState('');
  const [label, setLabel] = useState('');
  const [splits, setSplits] = useState<PartnerSplitShare[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const splitTotal = splits.reduce((s, p) => s + Math.max(0, p.percent), 0);

  const pickAgent = (commId: string) => {
    const mergeKey = resolveAgentMergeKey(commId);
    setAgentMergeKey(mergeKey);
    const existing = rules.find((r) => r.agentMergeKey === mergeKey);
    if (existing) {
      setLabel(existing.label ?? '');
      setSplits(existing.partnerSplits);
    } else {
      const agent = agents.find((a) => a.id === commId);
      setLabel(agent ? `Deals from ${agent.name}` : '');
      setSplits(
        partners.map((p) => ({
          profileId: p.profileId,
          percent: p.defaultHouseSharePercent,
        })),
      );
    }
  };

  const loadRule = (rule: AgentSourcingRule) => {
    setAgentMergeKey(rule.agentMergeKey);
    setLabel(rule.label ?? '');
    setSplits(rule.partnerSplits);
    setError('');
  };

  const resetForm = () => {
    setAgentMergeKey('');
    setLabel('');
    setSplits([]);
    setError('');
  };

  const save = async () => {
    if (!agentMergeKey) {
      setError('Select an agent chain.');
      return;
    }
    if (splitTotal <= 0) {
      setError('Enter at least one partner split %.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/agent-sourcing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentMergeKey,
          label: label.trim() || null,
          partnerSplits: splits.filter((s) => s.percent > 0),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      onChanged();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (mergeKey: string) => {
    if (!window.confirm('Remove this sourcing override?')) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/agent-sourcing?agentMergeKey=${encodeURIComponent(mergeKey)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Delete failed');
      if (agentMergeKey === mergeKey) resetForm();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div className="card-title" style={{ fontSize: 14 }}>Agent-chain sourcing overrides</div>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, lineHeight: 1.5 }}>
          When someone sources an external agent (e.g. Joe finds Agent A), set a custom house split for
          deals under that agent. After agent/override payouts, remaining house net uses this split
          instead of the global partner %.
        </p>

        {rules.length > 0 && (
          <table className="admin-mini-table" style={{ marginBottom: 16, width: '100%' }}>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Label</th>
                <th>Split</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.agentMergeKey}>
                  <td>{agentLabelForMergeKey(r.agentMergeKey, agents)}</td>
                  <td>{r.label || '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {r.partnerSplits
                      .map((s) => {
                        const name =
                          partners.find((p) => p.profileId === s.profileId)?.displayName
                          ?? s.profileId.slice(0, 8);
                        return `${name} ${s.percent}%`;
                      })
                      .join(' · ')}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="assist-mini-btn"
                      disabled={saving}
                      onClick={() => loadRule(r)}
                      style={{ marginRight: 6 }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="assist-mini-btn danger"
                      disabled={saving}
                      onClick={() => void remove(r.agentMergeKey)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="settings-invite-grid">
          <div className="settings-field">
            <label className="settings-field-label">External agent</label>
            <select
              className="settings-input"
              value={agents.find((a) => resolveAgentMergeKey(a.id) === agentMergeKey)?.id ?? ''}
              onChange={(e) => {
                if (e.target.value) pickAgent(e.target.value);
                else resetForm();
              }}
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.commissionRate}%)
                </option>
              ))}
            </select>
          </div>
          <div className="settings-field">
            <label className="settings-field-label">Label</label>
            <input
              className="settings-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Joe sourced Agent A"
            />
          </div>
        </div>

        {agentMergeKey && partners.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                Partner split for {agentLabelForMergeKey(agentMergeKey, agents)}
              </div>
              <div style={{ fontSize: 11, color: splitTotal === 100 ? 'var(--green)' : 'var(--gray)' }}>
                Total {splitTotal}%
              </div>
            </div>
            {partners.map((p) => {
              const current = splits.find((s) => s.profileId === p.profileId)?.percent ?? 0;
              return (
                <label
                  key={p.profileId}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}
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
                    onChange={(e) => {
                      const percent = Number(e.target.value) || 0;
                      setSplits((prev) => {
                        const others = prev.filter((s) => s.profileId !== p.profileId);
                        return [...others, { profileId: p.profileId, percent }];
                      });
                    }}
                  />
                  <span>%</span>
                  <button
                    type="button"
                    className="assist-mini-btn"
                    onClick={() =>
                      setSplits((prev) => {
                        const others = prev.filter((s) => s.profileId !== p.profileId);
                        return [...others, { profileId: p.profileId, percent: p.defaultHouseSharePercent }];
                      })
                    }
                  >
                    Default
                  </button>
                </label>
              );
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="admin-ticket-btn primary"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : rules.some((r) => r.agentMergeKey === agentMergeKey) ? 'Update override' : 'Save override'}
              </button>
              {agentMergeKey && (
                <button type="button" className="admin-ticket-btn" disabled={saving} onClick={resetForm}>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {error && <div className="settings-form-error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
