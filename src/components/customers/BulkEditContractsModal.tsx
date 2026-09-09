'use client';

import { useMemo, useState } from 'react';
import { getBmwAgentRates, resolveAgentDisplayName } from '@/lib/bmw/deal-master';
import { syncContractAgentAssignment } from '@/lib/bmw/deal-agent-sync';
import { setContractOverride } from '@/lib/customer-contract-overrides';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import {
  DEAL_STATUS_OPTIONS,
  PAY_SOURCE_OPTIONS,
  type CandidContractRecord,
  type DealStatus,
} from '@/lib/customer-records';
import type { Location } from '@/components/CustomersView';

const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
} as const;

const UNCHANGED = '';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${BRAND.grayBorder}`,
  borderRadius: 6,
  padding: '10px 12px',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 13,
  color: BRAND.grayDark,
  outline: 'none',
  boxSizing: 'border-box',
};

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label
    style={{
      display: 'block',
      fontSize: 11,
      fontWeight: 600,
      color: BRAND.gray,
      letterSpacing: '0.06em',
      marginBottom: 5,
    }}
  >
    {children}
  </label>
);

type AutoRenewChoice = '' | 'yes' | 'no';

export function BulkEditContractsModal({
  contracts,
  locations,
  onClose,
  onSave,
}: {
  contracts: CandidContractRecord[];
  locations: Location[];
  onClose: () => void;
  onSave: (updated: CandidContractRecord[]) => void | Promise<void>;
}) {
  const agents = useMemo(
    () =>
      getBmwAgentRates()
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const [dealStatus, setDealStatus] = useState<string>(UNCHANGED);
  const [locationId, setLocationId] = useState(UNCHANGED);
  const [agentCommId, setAgentCommId] = useState(UNCHANGED);
  const [agentCommissionRate, setAgentCommissionRate] = useState(UNCHANGED);
  const [provider, setProvider] = useState(UNCHANGED);
  const [paySource, setPaySource] = useState(UNCHANGED);
  const [service, setService] = useState(UNCHANGED);
  const [product, setProduct] = useState(UNCHANGED);
  const [contractStartDate, setContractStartDate] = useState(UNCHANGED);
  const [contractEndDate, setContractEndDate] = useState(UNCHANGED);
  const [autoRenews, setAutoRenews] = useState<AutoRenewChoice>(UNCHANGED);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAgentChange = (id: string) => {
    setAgentCommId(id);
    if (id === UNCHANGED) {
      setAgentCommissionRate(UNCHANGED);
      return;
    }
    if (id === '__direct__') {
      setAgentCommissionRate(UNCHANGED);
      return;
    }
    const profile = agents.find((a) => a.id === id);
    if (profile && agentCommissionRate === UNCHANGED) {
      setAgentCommissionRate(String(profile.commissionRate));
    }
  };

  const changedFieldCount = [
    dealStatus !== UNCHANGED,
    locationId !== UNCHANGED,
    agentCommId !== UNCHANGED,
    agentCommissionRate.trim() !== UNCHANGED,
    provider.trim() !== UNCHANGED,
    paySource !== UNCHANGED,
    service.trim() !== UNCHANGED,
    product.trim() !== UNCHANGED,
    contractStartDate !== UNCHANGED,
    contractEndDate !== UNCHANGED,
    autoRenews !== UNCHANGED,
  ].filter(Boolean).length;

  const submit = async () => {
    if (changedFieldCount === 0) {
      setError('Change at least one field to apply to the selected deals.');
      return;
    }

    const rateRaw = agentCommissionRate.trim();
    const rate = rateRaw ? Number(rateRaw) : undefined;
    if (rateRaw && (rate == null || !Number.isFinite(rate) || rate < 0 || rate > 100)) {
      setError('Agent rate must be between 0 and 100.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updatedList: CandidContractRecord[] = [];

      for (const contract of contracts) {
        const next: CandidContractRecord = { ...contract };
        const override: Parameters<typeof setContractOverride>[1] = {};

        if (dealStatus !== UNCHANGED) {
          next.dealStatus = dealStatus as DealStatus;
          override.dealStatus = next.dealStatus;
        }

        if (locationId !== UNCHANGED) {
          next.locationId = locationId;
          next.physicalLocationId = locationId;
          next.billingLocationId = locationId;
          override.locationId = locationId;
          override.physicalLocationId = locationId;
          override.billingLocationId = locationId;
        }

        if (agentCommId !== UNCHANGED) {
          if (agentCommId === '__direct__') {
            next.agentCommId = undefined;
            next.agentOfRecord = undefined;
            next.agentCommissionRate = undefined;
            override.agentCommId = null;
            override.agentOfRecord = null;
            override.agentCommissionRate = null;
          } else {
            const agentName = resolveAgentDisplayName(agentCommId);
            const profile = agents.find((a) => a.id === agentCommId);
            const resolvedRate =
              rate ??
              (profile ? profile.commissionRate : next.agentCommissionRate);
            next.agentCommId = agentCommId;
            next.agentOfRecord = agentName;
            next.agentCommissionRate = resolvedRate;
            override.agentCommId = agentCommId;
            override.agentOfRecord = agentName ?? null;
            override.agentCommissionRate = resolvedRate ?? null;
          }
        } else if (rateRaw) {
          next.agentCommissionRate = rate;
          override.agentCommissionRate = rate ?? null;
        }

        if (provider.trim() !== UNCHANGED) {
          const providerPart = provider.trim();
          next.solution = providerPart || undefined;
          override.solution = next.solution ?? null;
          const servicePart = (next.product || next.service || '').trim();
          const vendorParts = [providerPart, servicePart].filter(Boolean);
          next.vendor = vendorParts.length ? vendorParts.join(' — ') : next.vendor;
          override.vendor = next.vendor ?? null;
        }

        if (paySource !== UNCHANGED) {
          next.paySource = paySource || undefined;
          override.paySource = next.paySource ?? null;
        }

        if (service.trim() !== UNCHANGED) {
          next.service = service.trim() || undefined;
          override.service = next.service ?? null;
        }

        if (product.trim() !== UNCHANGED) {
          next.product = product.trim() || undefined;
          override.product = next.product ?? null;
        }

        if (contractStartDate !== UNCHANGED) {
          next.contractStartDate = contractStartDate || undefined;
          override.contractStartDate = next.contractStartDate ?? null;
        }

        if (contractEndDate !== UNCHANGED) {
          next.contractEndDate = contractEndDate || undefined;
          next.expires = contractEndDate || next.expires;
          override.contractEndDate = next.contractEndDate ?? null;
          override.expires = next.expires ?? null;
        }

        if (autoRenews !== UNCHANGED) {
          next.autoRenews = autoRenews === 'yes';
          override.autoRenews = next.autoRenews;
        }

        setContractOverride(contract.id, override);
        if (agentCommId !== UNCHANGED) {
          syncContractAgentAssignment(
            contract,
            agentCommId === '__direct__' ? '' : agentCommId,
          );
        }

        updatedList.push(next);
      }

      await onSave(updatedList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bulk edits');
      setSaving(false);
    }
  };

  return (
    <div
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
        role="dialog"
        aria-labelledby="bulk-edit-deals-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BRAND.white,
          borderRadius: 14,
          width: 720,
          maxWidth: '96vw',
          maxHeight: 'min(92vh, 880px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: BRAND.grayDark,
            padding: '20px 26px',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})`,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div
                id="bulk-edit-deals-title"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 17,
                  fontWeight: 600,
                  color: BRAND.white,
                }}
              >
                Edit {contracts.length} deal{contracts.length === 1 ? '' : 's'}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                Only fields you change are applied. Leave blank to keep each deal&apos;s current value.
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                width: 30,
                height: 30,
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 6,
                cursor: saving ? 'not-allowed' : 'pointer',
                color: '#9CA3AF',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: '18px 26px', overflowY: 'auto', flex: 1 }}>
          <div
            style={{
              background: BRAND.grayLight,
              border: `1px solid ${BRAND.grayBorder}`,
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 16,
              fontSize: 12,
              color: BRAND.grayDark,
              lineHeight: 1.45,
              maxHeight: 88,
              overflowY: 'auto',
            }}
          >
            <strong style={{ fontWeight: 700 }}>Selected:</strong>{' '}
            {contracts.map((c) => contractServiceTitle(c)).join(' · ')}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <FieldLabel>Status</FieldLabel>
              <select
                value={dealStatus}
                onChange={(e) => setDealStatus(e.target.value)}
                style={inputStyle}
              >
                <option value={UNCHANGED}>— leave unchanged —</option>
                {DEAL_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                style={inputStyle}
              >
                <option value={UNCHANGED}>— leave unchanged —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                    {l.isPrimary ? ' (Primary)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Agent of record</FieldLabel>
              <select
                value={agentCommId}
                onChange={(e) => handleAgentChange(e.target.value)}
                style={inputStyle}
              >
                <option value={UNCHANGED}>— leave unchanged —</option>
                <option value="__direct__">Direct — Candid Solutions (no agent)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name.replace(/^\* | \*$/g, '')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Agent commission rate (%)</FieldLabel>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={agentCommissionRate}
                onChange={(e) => setAgentCommissionRate(e.target.value)}
                placeholder="Leave blank to keep current"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Provider</FieldLabel>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Leave blank to keep current"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Pay source</FieldLabel>
              <select
                value={paySource}
                onChange={(e) => setPaySource(e.target.value)}
                style={inputStyle}
              >
                <option value={UNCHANGED}>— leave unchanged —</option>
                {PAY_SOURCE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Service label</FieldLabel>
              <input
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="Leave blank to keep current"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Product</FieldLabel>
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Leave blank to keep current"
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Contract start</FieldLabel>
              <input
                type="date"
                value={contractStartDate}
                onChange={(e) => setContractStartDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel>Contract end</FieldLabel>
              <input
                type="date"
                value={contractEndDate}
                onChange={(e) => setContractEndDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Auto-renews</FieldLabel>
              <select
                value={autoRenews}
                onChange={(e) => setAutoRenews(e.target.value as AutoRenewChoice)}
                style={inputStyle}
              >
                <option value={UNCHANGED}>— leave unchanged —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          {error ? (
            <p style={{ color: BRAND.red, fontSize: 13, marginTop: 12 }}>{error}</p>
          ) : (
            <p style={{ color: BRAND.gray, fontSize: 12, marginTop: 12 }}>
              {changedFieldCount === 0
                ? 'No fields changed yet.'
                : `${changedFieldCount} field${changedFieldCount === 1 ? '' : 's'} will update on ${contracts.length} deal${contracts.length === 1 ? '' : 's'}.`}
            </p>
          )}
        </div>

        <div
          style={{
            padding: '14px 26px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            style={{
              background: BRAND.grayLight,
              border: `1px solid ${BRAND.grayBorder}`,
              borderRadius: 7,
              padding: '11px 18px',
              fontSize: 13,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || changedFieldCount === 0}
            onClick={() => void submit()}
            style={{
              background: BRAND.red,
              color: BRAND.white,
              border: 'none',
              borderRadius: 7,
              padding: '11px 22px',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving || changedFieldCount === 0 ? 'not-allowed' : 'pointer',
              opacity: saving || changedFieldCount === 0 ? 0.7 : 1,
            }}
          >
            {saving
              ? 'Saving…'
              : `Apply to ${contracts.length} deal${contracts.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
