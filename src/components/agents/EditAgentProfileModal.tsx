'use client';

import { useMemo, useState } from 'react';
import type { Agent, AgentStatus } from '@/components/AgentsView';
import { saveAgentProfileOverride } from '@/lib/agents/agent-assignments';
import {
  agentHasOverridePartners,
  formatKeepOverrideSummary,
  listOverridePartnersForAgent,
} from '@/lib/agents/agent-override-partners';
import { formatInactiveEffectiveLabel, validateAgentLifecyclePatch } from '@/lib/agents/agent-lifecycle';
import { getBmwAgentRates } from '@/lib/bmw/deal-master';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};

export function EditAgentProfileModal({
  agent,
  onClose,
  onSaved,
}: {
  agent: Agent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const overridePartners = useMemo(
    () => listOverridePartnersForAgent(agent, getBmwAgentRates()),
    [agent],
  );
  const hasOverrides = overridePartners.length > 0;

  const [company, setCompany] = useState(agent.company);
  const [contactName, setContactName] = useState(agent.primaryContactName);
  const [contactEmail, setContactEmail] = useState(agent.primaryContactEmail);
  const [status, setStatus] = useState<AgentStatus>(agent.status);
  const [inactiveEffectiveDate, setInactiveEffectiveDate] = useState(
    agent.inactiveEffectiveDate?.slice(0, 10) ?? '',
  );
  const [keepOverridePartners, setKeepOverridePartners] = useState(
    agent.keepOverridePartners !== false,
  );
  const [notes, setNotes] = useState(agent.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const patch = {
      company: company.trim(),
      primaryContactName: contactName.trim(),
      primaryContactEmail: contactEmail.trim(),
      status,
      inactiveEffectiveDate:
        status === 'inactive' ? inactiveEffectiveDate.trim() || null : null,
      keepOverridePartners:
        status === 'inactive' && hasOverrides ? keepOverridePartners : undefined,
      notes: notes.trim() || undefined,
    };
    const validationError = validateAgentLifecyclePatch(patch);
    if (validationError) {
      setError(validationError);
      setSaving(false);
      return;
    }
    try {
      await saveAgentProfileOverride(agent.id, patch);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 750,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--white)',
          borderRadius: 14,
          width: 520,
          maxWidth: '95vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ background: 'var(--gray-dark)', padding: '20px 26px', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg,var(--red-dark),var(--red-light))',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--white)' }}>Edit agent</div>
            <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          {error && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: '#FEF2F2', color: 'var(--red)', fontSize: 13 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Agent / company name</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Primary contact</label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Email</label>
                <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AgentStatus)}
                style={inputStyle}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {status === 'inactive' && (
              <>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>
                    Inactive effective date
                  </label>
                  <input
                    type="date"
                    value={inactiveEffectiveDate}
                    onChange={(e) => setInactiveEffectiveDate(e.target.value)}
                    style={inputStyle}
                    required
                  />
                  <p style={{ fontSize: 11, color: 'var(--gray)', margin: '6px 0 0' }}>
                    Commissions for periods starting in this month onward no longer pay this agent.
                    The remainder goes to Candid Solutions unless override partners are kept below.
                    Prior months still pay this agent.
                  </p>
                  {inactiveEffectiveDate && (
                    <p style={{ fontSize: 11, color: 'var(--gray)', margin: '4px 0 0' }}>
                      Effective {formatInactiveEffectiveLabel(inactiveEffectiveDate)}
                    </p>
                  )}
                </div>
                {hasOverrides && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--gray-light)',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        fontSize: 13,
                        lineHeight: 1.45,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={keepOverridePartners}
                        onChange={(e) => setKeepOverridePartners(e.target.checked)}
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        <strong>Keep paying override partners</strong>
                        <br />
                        <span style={{ color: 'var(--gray)', fontSize: 12 }}>
                          {formatKeepOverrideSummary(overridePartners)}
                        </span>
                      </span>
                    </label>
                    <p style={{ fontSize: 11, color: 'var(--gray)', margin: '8px 0 0 28px', lineHeight: 1.45 }}>
                      {keepOverridePartners
                        ? 'Override partners continue receiving their override rate from this agent’s deals. This agent’s share goes to Candid Solutions.'
                        : 'All commission from this agent’s deals goes to Candid Solutions — override partners are not paid.'}
                    </p>
                    <ul style={{ margin: '8px 0 0 28px', padding: 0, listStyle: 'none', fontSize: 12 }}>
                      {overridePartners.map((partner) => (
                        <li key={partner.mergeKey} style={{ color: 'var(--gray-dark)', marginBottom: 4 }}>
                          {partner.name}
                          {partner.overrideRate != null ? ` · ${partner.overrideRate}% override` : ''}
                          <span style={{ color: 'var(--gray)' }}> ({partner.tierLabel})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {status !== 'inactive' && agentHasOverridePartners(agent) && (
              <p style={{ fontSize: 11, color: 'var(--gray)', margin: 0, lineHeight: 1.45 }}>
                Override partners: {formatKeepOverrideSummary(overridePartners)}
              </p>
            )}
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void submit()}>
              Save
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
