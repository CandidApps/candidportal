'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  commissionRowCustomer,
  commissionRowUid,
  matchDealToCommissionRow,
} from '@/lib/bmw/commission-match';
import { bmwDealsToCustomers, getBmwAgentRates, getBmwDeals } from '@/lib/bmw/deal-master';
import type { Customer } from '@/components/CustomersView';
import type { BmwAgentRate } from '@/lib/bmw/types';
import { getAddedDeals, saveAddedDeal } from '@/lib/bmw/added-deals';
import { normalizeUid } from '@/lib/bmw/deal-key';
import {
  SUPPLIER_LABELS,
  amountFieldForSupplier,
  type SupplierId,
  type SupplierImportBatch,
} from '@/lib/commissions/supplier-config';
import { formatCommissionCurrency, formatPeriodLabel } from '@/lib/commissions/commission-store';
import { paySourceForSupplier } from '@/lib/bmw/pay-source-map';
import { lookupSolutionCommissionRate, loadSolutionProviders } from '@/lib/solution-providers';

type UnmatchedItem = {
  idx: number;
  uid: string;
  customer: string;
  amount: number;
  row: Record<string, unknown>;
};

function rowAmount(row: Record<string, unknown>, field: string): number {
  const v = row[field];
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Columns that may carry the agent / rep name on a commission report row. */
const AGENT_NAME_FIELDS = [
  'agent_name',
  'agent',
  'rep',
  'sales_rep_name',
  'SalesRep',
  'sales_rep',
  'partner',
];

function normName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Recognize the agent for an unmatched line item: first from the agent/rep
 * name on the report row itself, then from an existing deal with the same
 * merchant name in the deal master.
 */
function recognizeAgent(item: UnmatchedItem, agents: BmwAgentRate[]): BmwAgentRate | null {
  for (const field of AGENT_NAME_FIELDS) {
    const raw = item.row[field];
    if (raw == null || raw === '') continue;
    const wanted = normName(raw);
    if (!wanted) continue;
    const byName = agents.find((a) => normName(a.name) === wanted || normName(a.id) === wanted);
    if (byName) return byName;
  }

  if (item.customer) {
    const wanted = normalizeUid(item.customer);
    const deal = getBmwDeals().find(
      (d) => d.agentCommId && normalizeUid(d.merchant) === wanted,
    );
    if (deal) {
      const profile = agents.find((a) => a.id === deal.agentCommId);
      if (profile) return profile;
    }
  }

  return null;
}

/** Generic words that shouldn't count as a name match on their own. */
const NAME_STOP_WORDS = new Set([
  'llc', 'inc', 'incorporated', 'corp', 'corporation', 'company', 'ltd',
  'the', 'and', 'of', 'dba', 'group', 'center', 'centre', 'clinic',
  'services', 'solutions', 'partners', 'holdings',
]);

function distinctiveTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !NAME_STOP_WORDS.has(t));
}

/**
 * Recognize a parent customer for a line item by shared distinctive name
 * tokens (e.g. "NUVIA OKLAHOMA CITY, LLC" → "Nuvia Dental Implant Center").
 */
function recognizeParentCustomer(itemCustomer: string, customers: Customer[]): Customer | null {
  const itemTokens = distinctiveTokens(itemCustomer);
  if (!itemTokens.length) return null;

  let best: Customer | null = null;
  let bestScore = 0;
  for (const customer of customers) {
    const tokens = new Set(distinctiveTokens(customer.company));
    if (!tokens.size) continue;
    let score = itemTokens.reduce((s, t) => s + (tokens.has(t) ? 1 : 0), 0);
    // First-token match (usually the brand name) is the strongest signal.
    if (score > 0 && tokens.has(itemTokens[0]!)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = customer;
    }
  }
  // Require the brand-level signal, not just one incidental shared word.
  return bestScore >= 2 ? best : null;
}

/** Default agent for a customer, taken from their existing deals. */
function agentForCustomer(customer: Customer, agents: BmwAgentRate[]): BmwAgentRate | null {
  const wanted = normalizeUid(customer.company);
  const deal = getBmwDeals().find(
    (d) => d.agentCommId && normalizeUid(d.merchant) === wanted,
  );
  return deal ? agents.find((a) => a.id === deal.agentCommId) ?? null : null;
}

function AddDealForm({
  supplier,
  item,
  onSaved,
  onCancel,
}: {
  supplier: SupplierId;
  item: UnmatchedItem;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const agents = useMemo(
    () =>
      getBmwAgentRates()
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const customers = useMemo(() => bmwDealsToCustomers(), []);
  const recognizedAgent = useMemo(() => recognizeAgent(item, agents), [item, agents]);
  const recognizedParent = useMemo(
    () => recognizeParentCustomer(item.customer, customers),
    [item.customer, customers],
  );
  // When the parent is recognized but the report row carries no agent,
  // default to the parent customer's agent.
  const defaultAgent = useMemo(
    () => recognizedAgent ?? (recognizedParent ? agentForCustomer(recognizedParent, agents) : null),
    [recognizedAgent, recognizedParent, agents],
  );

  const [merchant, setMerchant] = useState(item.customer);
  const [dealUid, setDealUid] = useState(item.uid);
  const [parentId, setParentId] = useState(recognizedParent?.id ?? '');
  const [agentCommId, setAgentCommId] = useState(defaultAgent?.id ?? '');
  const [commissionRate, setCommissionRate] = useState(
    defaultAgent ? String(defaultAgent.commissionRate) : '',
  );
  const [product, setProduct] = useState('');
  const [provider, setProvider] = useState('');
  const [error, setError] = useState<string | null>(null);

  const paySource = paySourceForSupplier(supplier);
  const configuredCandidRate = useMemo(() => {
    if (!provider.trim() || !product.trim()) return null;
    return lookupSolutionCommissionRate(provider.trim(), product.trim(), paySource);
  }, [provider, product, paySource]);

  const estimatedCandidCommission = useMemo(() => {
    if (configuredCandidRate == null || !Number.isFinite(item.amount)) return null;
    return Math.round(item.amount * (configuredCandidRate / 100) * 100) / 100;
  }, [configuredCandidRate, item.amount]);

  // Re-sync prefill if a different line item is shown without a remount.
  useEffect(() => {
    setMerchant(item.customer);
    setDealUid(item.uid);
    setParentId(recognizedParent?.id ?? '');
    setAgentCommId(defaultAgent?.id ?? '');
    setCommissionRate(defaultAgent ? String(defaultAgent.commissionRate) : '');
    setProduct('');
    setProvider('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

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
      setError('Deal ID is required.');
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
    saveAddedDeal({
      supplier,
      dealUid: dealUid.trim(),
      merchant: merchant.trim(),
      agentCommId,
      agentName: agent?.name ?? agentCommId,
      commissionRate: rate,
      product: product.trim() || undefined,
      provider: provider.trim() || undefined,
      candidCommissionRate: configuredCandidRate ?? undefined,
      parentCustomerId: parent?.id,
      parentCustomerName: parent?.company,
      addedAt: new Date().toISOString(),
    });
    onSaved();
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 14 }}>
        Add this line item as a new deal. Recognized info is prefilled — choose the agent and
        commission tier to finish.
      </p>
      <div className="form-group">
        <label>Customer name</label>
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Customer / merchant name" />
      </div>
      <div className="form-group">
        <label>Deal ID / account</label>
        <input type="text" value={dealUid} onChange={(e) => setDealUid(e.target.value)} placeholder="MID, account number, …" />
      </div>
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
        {recognizedParent && parentId === recognizedParent.id ? (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
            Recognized as a location of {recognizedParent.company}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
            Pick a customer if this is an additional location / sub-account.
          </div>
        )}
      </div>
      <div className="form-group">
        <label>Supplier</label>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{SUPPLIER_LABELS[supplier]}</div>
      </div>
      <div className="form-group">
        <label>Latest commission</label>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatCommissionCurrency(item.amount)}</div>
      </div>
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
        {recognizedAgent ? (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
            Recognized from the report: {recognizedAgent.name.replace(/^\* | \*$/g, '')}
          </div>
        ) : defaultAgent && agentCommId === defaultAgent.id ? (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
            Defaulted from the parent customer&apos;s agent
          </div>
        ) : null}
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
          placeholder="e.g. 50"
        />
      </div>
      <div className="form-group">
        <label>Provider / vendor</label>
        <input type="text" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Comcast, Vonage, Dialpad" />
      </div>
      <div className="form-group">
        <label>Product / service (optional)</label>
        <input type="text" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. UCaaS, Fixed Wireless Broadband" />
        {configuredCandidRate != null && (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
            Configured Candid rate through {paySource}: {configuredCandidRate}%
            {estimatedCandidCommission != null && (
              <> · Est. commission on this line: {formatCommissionCurrency(estimatedCandidCommission)}</>
            )}
          </div>
        )}
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="admin-ticket-btn" onClick={onCancel}>
          Back
        </button>
        <button type="button" className="admin-ticket-btn primary" onClick={handleSave}>
          Save deal
        </button>
      </div>
    </div>
  );
}

export function NewDealsModal({
  supplier,
  batch,
  onClose,
}: {
  supplier: SupplierId;
  batch: SupplierImportBatch | undefined;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<UnmatchedItem | null>(null);
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    void loadSolutionProviders();
  }, []);

  const unmatched = useMemo<UnmatchedItem[]>(() => {
    if (!batch) return [];
    const amountField = amountFieldForSupplier(supplier);
    const seen = new Set<string>();
    const items: UnmatchedItem[] = [];
    batch.rows.forEach((row, idx) => {
      if (matchDealToCommissionRow(supplier, row)) return;
      const uid = commissionRowUid(supplier, row);
      const customer = commissionRowCustomer(row);
      const dedupeKey = normalizeUid(uid || customer || String(idx));
      if (seen.has(dedupeKey)) {
        const existing = items.find((i) => normalizeUid(i.uid || i.customer || String(i.idx)) === dedupeKey);
        if (existing) existing.amount += rowAmount(row, amountField);
        return;
      }
      seen.add(dedupeKey);
      items.push({ idx, uid, customer, amount: rowAmount(row, amountField), row });
    });
    return items;
  }, [batch, supplier]);

  const addedUids = useMemo(() => {
    void savedTick;
    return new Set(
      getAddedDeals()
        .filter((d) => d.supplier === supplier)
        .map((d) => normalizeUid(d.dealUid)),
    );
  }, [supplier, savedTick]);

  return (
    <div className="modal-overlay open bank-classify-overlay" onClick={onClose}>
      <div className="modal-box bank-classify-modal" style={{ width: 'min(640px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            New deals — {SUPPLIER_LABELS[supplier]}
            {batch ? ` · ${formatPeriodLabel(batch.period)}` : ''}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {selected ? (
            <AddDealForm
              key={`${selected.idx}-${selected.uid}`}
              supplier={supplier}
              item={selected}
              onSaved={() => {
                setSavedTick((t) => t + 1);
                setSelected(null);
              }}
              onCancel={() => setSelected(null)}
            />
          ) : !batch ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>
              No commission data imported for this period, so there are no line items to review.
            </p>
          ) : unmatched.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>
              Every line item in this import is tied to a deal in the system. Nothing to add.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 12 }}>
                {unmatched.length} line item{unmatched.length === 1 ? '' : 's'} in this import{' '}
                {unmatched.length === 1 ? 'is' : 'are'} not tied to a customer deal in the system.
              </p>
              <table className="admin-mini-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>ID / account</th>
                    <th style={{ textAlign: 'right' }}>Commission</th>
                    <th style={{ width: 90 }} />
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map((item) => {
                    const added = item.uid !== '' && addedUids.has(normalizeUid(item.uid));
                    return (
                      <tr key={item.idx}>
                        <td style={{ fontWeight: 600 }}>{item.customer || '—'}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{item.uid || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {formatCommissionCurrency(item.amount)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {added ? (
                            <span className="admin-status-pill admin-status-pill--resolved">Added</span>
                          ) : (
                            <button
                              type="button"
                              className="admin-ticket-btn primary"
                              onClick={() => setSelected(item)}
                            >
                              Add
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
        {!selected && (
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--gray-border)' }}>
            <button type="button" className="admin-ticket-btn" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default NewDealsModal;
