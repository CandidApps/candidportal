'use client';

import { useMemo, useState } from 'react';
import type { Agent, AgentCustomerRef } from '@/components/AgentsView';
import { EditAgentProfileModal } from '@/components/agents/EditAgentProfileModal';
import {
  EditAgentCustomerModal,
  removeAgentCustomer,
} from '@/components/agents/EditAgentCustomerModal';
import { AgentDocumentsSection } from '@/components/agents/AgentDocumentsSection';
import {
  agentMergeKeyFromProfile,
  listAvailableCustomersForAgent,
} from '@/lib/bmw/merged-agents';
import { getBmwAgentRates } from '@/lib/bmw/deal-master';
import { formatInactiveEffectiveLabel } from '@/lib/agents/agent-lifecycle';
import {
  agentHasOverridePartners,
  formatKeepOverrideSummary,
  listOverridePartnersForAgent,
} from '@/lib/agents/agent-override-partners';

function tierLabelById(agent: Agent, tierId: string): string {
  return agent.tiers.find((t) => t.id === tierId)?.label ?? tierId;
}

function customerTierId(agent: Agent, customerId: string): string {
  for (const tier of agent.tiers) {
    if (tier.customers.some((c) => c.id === customerId)) return tier.id;
  }
  return agent.tiers[0]?.id ?? '';
}

export function AgentDetailPage({
  agent,
  onBack,
  onRefresh,
  onSelectCustomer,
}: {
  agent: Agent;
  onBack: () => void;
  onRefresh: () => void;
  onSelectCustomer?: (customerId: string) => void;
}) {
  const [editProfile, setEditProfile] = useState(false);
  const [customerModal, setCustomerModal] = useState<'add' | AgentCustomerRef | null>(null);

  const availableCustomers = useMemo(() => listAvailableCustomersForAgent(agent), [agent]);

  const overridePartners = useMemo(
    () => listOverridePartnersForAgent(agent, getBmwAgentRates()),
    [agent],
  );

  const customersWithTier = useMemo(
    () =>
      agent.customers.map((c) => ({
        ...c,
        tierId: customerTierId(agent, c.id),
      })),
    [agent],
  );

  const handleRefresh = () => {
    onRefresh();
  };

  return (
    <div>
      <button type="button" className="btn-secondary" style={{ marginBottom: 16, fontSize: 12 }} onClick={onBack}>
        ← Back to agents
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="card-title">{agent.company}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
              {agent.primaryContactName} · {agent.primaryContactEmail}
            </div>
            {agent.notes && (
              <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8 }}>{agent.notes}</div>
            )}
          </div>
          <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditProfile(true)}>
            Edit agent
          </button>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Status</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, textTransform: 'capitalize' }}>{agent.status}</div>
              {agent.status === 'inactive' && agent.inactiveEffectiveDate && (
                <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                  From {formatInactiveEffectiveLabel(agent.inactiveEffectiveDate)}
                </div>
              )}
              {agent.status === 'inactive' && agentHasOverridePartners(agent) && (
                <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                  {agent.keepOverridePartners !== false
                    ? `Override partners kept: ${formatKeepOverrideSummary(overridePartners)}`
                    : 'Override partners not paid'}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Customers</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{agent.customerCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase' }}>Commission tiers</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{agent.tiers.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title" style={{ fontSize: 14 }}>Commission tiers</div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-mini-table comm-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Rate</th>
                <th>Override partner</th>
                <th style={{ textAlign: 'right' }}>Customers on tier</th>
              </tr>
            </thead>
            <tbody>
              {agent.tiers.map((tier) => (
                <tr key={tier.id}>
                  <td style={{ fontSize: 12 }}>{tier.label}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tier.commissionRate}%</td>
                  <td style={{ fontSize: 12, color: 'var(--gray)' }}>
                    {tier.overridePartner
                      ? `${tier.overridePartner}${tier.overrideRate != null ? ` (${tier.overrideRate}%)` : ''}`
                      : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{tier.customers.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {agent.tiers.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--gray-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', marginBottom: 8 }}>
                Customers per tier
              </div>
              {agent.tiers.map((tier) => (
                <div key={tier.id} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{tier.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                    {tier.customers.length
                      ? tier.customers.map((c) => c.name).join(', ')
                      : 'No customers on this tier'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AgentDocumentsSection agentMergeKey={agent.id} agentCompany={agent.company} />

      <div className="card">
        <div className="card-header" style={{ gap: 12 }}>
          <div className="card-title" style={{ fontSize: 14, flex: 1 }}>Customers</div>
          <button
            type="button"
            className="btn-primary"
            style={{ fontSize: 12 }}
            onClick={() => setCustomerModal('add')}
            disabled={!availableCustomers.length || !agent.tiers.length}
          >
            + Add customer
          </button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {customersWithTier.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: 'var(--gray)' }}>No customers assigned to this agent yet.</p>
          ) : (
            <table className="admin-mini-table comm-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Commission tier</th>
                  <th style={{ width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customersWithTier.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => onSelectCustomer?.(c.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--blue)',
                          fontWeight: 600,
                          cursor: onSelectCustomer ? 'pointer' : 'default',
                          fontSize: 13,
                        }}
                      >
                        {c.name}
                      </button>
                    </td>
                    <td style={{ fontSize: 12 }}>{tierLabelById(agent, c.tierId)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => setCustomerModal(c)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => {
                            if (window.confirm(`Remove ${c.name} from this agent?`)) {
                              removeAgentCustomer(c.id);
                              handleRefresh();
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editProfile && (
        <EditAgentProfileModal
          agent={agent}
          onClose={() => setEditProfile(false)}
          onSaved={() => {
            setEditProfile(false);
            handleRefresh();
          }}
        />
      )}

      {customerModal && (
        <EditAgentCustomerModal
          agent={agent}
          mode={customerModal === 'add' ? 'add' : 'edit'}
          customer={customerModal === 'add' ? undefined : customerModal}
          availableCustomers={availableCustomers}
          onClose={() => setCustomerModal(null)}
          onSaved={() => {
            setCustomerModal(null);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}

export function mergeKeyForAgentCommId(agentCommId: string): string | null {
  const profile = getBmwAgentRates().find((r) => r.id === agentCommId);
  if (!profile) return null;
  return agentMergeKeyFromProfile(profile);
}
