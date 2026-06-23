'use client';

import { useState } from 'react';
import type { Agent, AgentStatus } from '@/components/AgentsView';
import { saveAgentProfileOverride } from '@/lib/agents/agent-assignments';

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
  const [company, setCompany] = useState(agent.company);
  const [contactName, setContactName] = useState(agent.primaryContactName);
  const [contactEmail, setContactEmail] = useState(agent.primaryContactEmail);
  const [status, setStatus] = useState<AgentStatus>(agent.status);
  const [notes, setNotes] = useState(agent.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setSaving(true);
    setError(null);
    try {
      saveAgentProfileOverride(agent.id, {
        company: company.trim(),
        primaryContactName: contactName.trim(),
        primaryContactEmail: contactEmail.trim(),
        status,
        notes: notes.trim() || undefined,
      });
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
              <select value={status} onChange={(e) => setStatus(e.target.value as AgentStatus)} style={inputStyle}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
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
