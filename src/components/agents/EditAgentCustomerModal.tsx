'use client';

import { useMemo, useState } from 'react';
import type { Agent, AgentCustomerRef } from '@/components/AgentsView';
import {
  removeCustomerFromAgents,
  setCustomerTierOverride,
} from '@/lib/agents/agent-assignments';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};

export function EditAgentCustomerModal({
  agent,
  customer,
  availableCustomers,
  mode,
  onClose,
  onSaved,
}: {
  agent: Agent;
  customer?: AgentCustomerRef;
  availableCustomers: AgentCustomerRef[];
  mode: 'add' | 'edit';
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultTier = customer?.tierId ?? agent.tiers[0]?.id ?? '';
  const [customerId, setCustomerId] = useState(customer?.id ?? '');
  const [tierId, setTierId] = useState(defaultTier);
  const [error, setError] = useState<string | null>(null);

  const customerOptions = useMemo(() => {
    if (mode === 'edit' && customer) {
      return [customer, ...availableCustomers.filter((c) => c.id !== customer.id)];
    }
    return availableCustomers;
  }, [availableCustomers, customer, mode]);

  const submit = () => {
    if (!customerId) {
      setError('Select a customer.');
      return;
    }
    if (!tierId) {
      setError('Select a commission tier.');
      return;
    }
    setCustomerTierOverride(customerId, tierId);
    onSaved();
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
          width: 480,
          maxWidth: '95vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          padding: 24,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {mode === 'add' ? 'Add customer to agent' : 'Edit customer assignment'}
        </div>
        {error && (
          <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: '#FEF2F2', color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={inputStyle}
              disabled={mode === 'edit'}
            >
              <option value="">Select customer…</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Commission tier</label>
            <select value={tierId} onChange={(e) => setTierId(e.target.value)} style={inputStyle}>
              {agent.tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button type="button" className="btn-primary" onClick={submit}>
            Save
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function removeAgentCustomer(customerId: string) {
  removeCustomerFromAgents(customerId);
}
