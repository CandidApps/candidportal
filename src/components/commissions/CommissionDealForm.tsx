'use client';

import { useEffect, useMemo, useState } from 'react';
import { bmwDealsToCustomers, getBmwAgentRates } from '@/lib/bmw/deal-master';
import { useCrmData } from '@/components/CrmDataProvider';
import type { Customer } from '@/components/CustomersView';
import type { BmwAgentRate } from '@/lib/bmw/types';
import {
  type CommissionDealType,
  saveCommissionDeal,
} from '@/lib/bmw/added-deals';
import {
  agentForCustomer,
  recognizeAgentFromRow,
  recognizeParentCustomer,
} from '@/lib/commissions/commission-deal-prefill';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import { lookupSolutionCommissionRate } from '@/lib/solution-providers';
import {
  SUPPLIER_LABELS,
  type SupplierId,
} from '@/lib/commissions/supplier-config';
import { formatCommissionCurrency } from '@/lib/commissions/commission-store';

export type CommissionDealFormValues = {
  dealUid: string;
  merchant: string;
  agentCommId: string;
  commissionRate: string;
  commissionType: CommissionDealType;
  parentCustomerId: string;
  product: string;
  provider: string;
};

type Props = {
  supplier?: SupplierId;
  paySource?: string;
  /** Prefill from a commission report row. */
  sourceRow?: Record<string, unknown>;
  initialDealUid?: string;
  initialMerchant?: string;
  initialAmount?: number;
  showParentCustomer?: boolean;
  showProviderProduct?: boolean;
  showLatestCommission?: boolean;
  submitLabel?: string;
  onSaved: () => void;
  onCancel?: () => void;
};

export function CommissionDealForm({
  supplier,
  paySource,
  sourceRow,
  initialDealUid = '',
  initialMerchant = '',
  initialAmount,
  showParentCustomer = true,
  showProviderProduct = false,
  showLatestCommission = false,
  submitLabel = 'Save deal',
  onSaved,
  onCancel,
}: Props) {
  const { ready, agentRates, bmwDeals } = useCrmData();
  const agents = useMemo(
    () =>
      ready
        ? getBmwAgentRates()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [ready, agentRates],
  );
  const customers = useMemo(() => (ready ? bmwDealsToCustomers() : []), [ready, bmwDeals]);

  const recognizedAgent = useMemo(
    () => (sourceRow ? recognizeAgentFromRow(sourceRow, initialMerchant, agents) : null),
    [sourceRow, initialMerchant, agents],
  );
  const recognizedParent = useMemo(
    () => (initialMerchant ? recognizeParentCustomer(initialMerchant, customers) : null),
    [initialMerchant, customers],
  );
  const defaultAgent = useMemo(
    () => recognizedAgent ?? (recognizedParent ? agentForCustomer(recognizedParent, agents) : null),
    [recognizedAgent, recognizedParent, agents],
  );

  const [merchant, setMerchant] = useState(initialMerchant);
  const [dealUid, setDealUid] = useState(initialDealUid);
  const [parentId, setParentId] = useState(recognizedParent?.id ?? '');
  const [agentCommId, setAgentCommId] = useState(defaultAgent?.id ?? '');
  const [commissionRate, setCommissionRate] = useState(
    defaultAgent ? String(defaultAgent.commissionRate) : '',
  );
  const [commissionType, setCommissionType] = useState<CommissionDealType>('recurring');
  const [product, setProduct] = useState('');
  const [provider, setProvider] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolvedPaySource = paySource ?? (supplier ? paySourceForSupplier(supplier) : '');
  const configuredCandidRate = useMemo(() => {
    if (!showProviderProduct || !provider.trim() || !product.trim()) return null;
    return lookupSolutionCommissionRate(provider.trim(), product.trim(), resolvedPaySource);
  }, [showProviderProduct, provider, product, resolvedPaySource]);

  useEffect(() => {
    setMerchant(initialMerchant);
    setDealUid(initialDealUid);
    setParentId(recognizedParent?.id ?? '');
    setAgentCommId(defaultAgent?.id ?? '');
    setCommissionRate(defaultAgent ? String(defaultAgent.commissionRate) : '');
    setCommissionType('recurring');
    setProduct('');
    setProvider('');
    setError(null);
  }, [initialDealUid, initialMerchant, recognizedParent?.id, defaultAgent?.id, defaultAgent?.commissionRate]);

  const handleAgentChange = (id: string) => {
    setAgentCommId(id);
    const agent = agents.find((a) => a.id === id);
    if (agent) setCommissionRate(String(agent.commissionRate));
  };

  const handleParentChange = (id: string) => {
    setParentId(id);
    if (agentCommId) return;
    const parent = customers.find((c) => c.id === id);
    const agent = parent ? agentForCustomer(parent, agents) : null;
    if (agent) {
      setAgentCommId(agent.id);
      setCommissionRate(String(agent.commissionRate));
    }
  };

  const handleSave = () => {
    if (!merchant.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!dealUid.trim()) {
      setError('Deal UID is required.');
      return;
    }
    if (!agentCommId) {
      setError('Select an agent for this deal.');
      return;
    }
    const rate = Number(commissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError('Commission tier must be a percentage between 0 and 100.');
      return;
    }
    const agent = agents.find((a) => a.id === agentCommId);
    const parent = customers.find((c) => c.id === parentId);
    saveCommissionDeal({
      supplier,
      paySource: supplier ? undefined : paySource,
      dealUid: dealUid.trim(),
      merchant: merchant.trim(),
      agentCommId,
      agentName: agent?.name ?? agentCommId,
      commissionRate: rate,
      commissionType,
      product: product.trim() || undefined,
      provider: provider.trim() || undefined,
      candidCommissionRate: configuredCandidRate ?? undefined,
      parentCustomerId: parent?.id,
      parentCustomerName: parent?.company,
    });
    onSaved();
  };

  return (
    <div>
      {supplier && (
        <div className="form-group">
          <label>Supplier</label>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{SUPPLIER_LABELS[supplier]}</div>
        </div>
      )}
      {paySource && !supplier && (
        <div className="form-group">
          <label>Pay source</label>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{paySource}</div>
        </div>
      )}
      {showLatestCommission && initialAmount != null && (
        <div className="form-group">
          <label>Latest commission</label>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {formatCommissionCurrency(initialAmount)}
          </div>
        </div>
      )}
      <div className="form-group">
        <label>Customer / merchant</label>
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Customer name" />
      </div>
      <div className="form-group">
        <label>Deal UID</label>
        <input type="text" value={dealUid} onChange={(e) => setDealUid(e.target.value)} placeholder="MID, account number, …" />
      </div>
      {showParentCustomer && (
        <div className="form-group">
          <label>Parent customer</label>
          <select
            className="comm-period-select"
            style={{ width: '100%' }}
            value={parentId}
            onChange={(e) => handleParentChange(e.target.value)}
          >
            <option value="">— None (standalone customer) —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.company}</option>
            ))}
          </select>
        </div>
      )}
      <div className="form-group">
        <label>Agent</label>
        <select
          className="comm-period-select"
          style={{ width: '100%' }}
          value={agentCommId}
          onChange={(e) => handleAgentChange(e.target.value)}
        >
          <option value="">— Select agent —</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.id})
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Commission tier (%)</label>
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={commissionRate}
          onChange={(e) => setCommissionRate(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Commission type</label>
        <select
          className="comm-period-select"
          style={{ width: '100%' }}
          value={commissionType}
          onChange={(e) => setCommissionType(e.target.value as CommissionDealType)}
        >
          <option value="recurring">Recurring (monthly)</option>
          <option value="one_time">One-time</option>
        </select>
      </div>
      {showProviderProduct && (
        <>
          <div className="form-group">
            <label>Provider / vendor</label>
            <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Product / service</label>
            <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} />
          </div>
        </>
      )}
      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onCancel && (
          <button type="button" className="admin-ticket-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="admin-ticket-btn primary" onClick={handleSave}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/** Inline agent + type pickers for table rows. */
export function CommissionDealRowFields({
  agentCommId,
  commissionType,
  agents,
  onAgentChange,
  onTypeChange,
}: {
  agentCommId: string;
  commissionType: CommissionDealType;
  agents: BmwAgentRate[];
  onAgentChange: (id: string) => void;
  onTypeChange: (type: CommissionDealType) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
      <select
        className="comm-period-select"
        style={{ width: '100%', fontSize: 12 }}
        value={agentCommId}
        onChange={(e) => onAgentChange(e.target.value)}
      >
        <option value="">— Agent —</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <select
        className="comm-period-select"
        style={{ width: '100%', fontSize: 12 }}
        value={commissionType}
        onChange={(e) => onTypeChange(e.target.value as CommissionDealType)}
      >
        <option value="recurring">Recurring</option>
        <option value="one_time">One-time</option>
      </select>
    </div>
  );
}

export function agentRateForId(agents: BmwAgentRate[], id: string): number {
  return agents.find((a) => a.id === id)?.commissionRate ?? 0;
}

export function agentNameForId(agents: BmwAgentRate[], id: string): string {
  const agent = agents.find((a) => a.id === id);
  return agent?.name ?? id;
}
