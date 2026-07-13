'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  ensurePortalApiCustomerCookie,
  ensurePortalPreviewSession,
  getPortalSessionScope,
} from '@/lib/portal-access';
import type { MemberPendingContract } from '@/lib/services/member-pending-contracts';

type MemberPendingContractsPanelProps = {
  customerId?: string | null;
  onChanged?: () => void;
};

function scopedCustomerId(prop?: string | null): string | null {
  const fromProp = prop?.trim();
  if (fromProp) return fromProp;
  if (typeof window === 'undefined') return null;
  ensurePortalPreviewSession();
  return getPortalSessionScope()?.customerId?.trim() || null;
}

export function MemberPendingContractsPanel({
  customerId = null,
  onChanged,
}: MemberPendingContractsPanelProps) {
  const [contracts, setContracts] = useState<MemberPendingContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      ensurePortalPreviewSession();
      const scopedId = scopedCustomerId(customerId);
      ensurePortalApiCustomerCookie(scopedId);
      const qs = new URLSearchParams();
      if (scopedId) qs.set('customerId', scopedId);
      const res = await fetch(`/api/portal/contracts?${qs.toString()}`, { cache: 'no-store' });
      const data = (await res.json()) as { contracts?: MemberPendingContract[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not load contracts');
      setContracts(data.contracts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load contracts');
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const confirmSigned = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      const scopedId = scopedCustomerId(customerId);
      ensurePortalApiCustomerCookie(scopedId);
      const res = await fetch(`/api/portal/contracts/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'confirm_signed', customerId: scopedId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not confirm signature');
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm signature');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && contracts.length === 0) {
    return null;
  }
  if (!loading && contracts.length === 0 && !error) {
    return null;
  }

  return (
    <div className="card" style={{ marginBottom: 20, borderColor: 'var(--amber, #D97706)' }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AppIcon name="file" size={16} />
          Contracts ready to sign
        </div>
        <span style={{ fontSize: 12, color: 'var(--gray)', fontWeight: 600 }}>
          {contracts.length} pending
        </span>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-dark)' }}>
          Candid sent {contracts.length === 1 ? 'a contract' : 'contracts'} for your review. Open
          the document, sign with the vendor, then confirm here so we can finish activation.
        </p>
        {error ? (
          <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>
        ) : null}
        {contracts.map((c) => {
          const scopedId = scopedCustomerId(customerId);
          const openHref =
            c.openPath && scopedId
              ? `${c.openPath}?customerId=${encodeURIComponent(scopedId)}`
              : c.openPath;
          return (
          <div
            key={c.id}
            style={{
              border: '1px solid var(--gray-border)',
              borderRadius: 10,
              padding: 14,
              background: 'var(--surface-muted, #f8fafc)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {c.vendorName || c.serviceLabel}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
                {c.serviceLabel}
                {c.monthlyTotal != null ? ` · ~$${c.monthlyTotal.toFixed(2)}/mo` : ''}
                {c.contractFilename ? ` · ${c.contractFilename}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {openHref ? (
                <a
                  href={openHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-ticket-btn primary"
                  style={{ textDecoration: 'none' }}
                >
                  Open contract
                </a>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--amber)' }}>
                  No file or link attached yet — contact Candid.
                </span>
              )}
              <button
                type="button"
                className="admin-ticket-btn"
                disabled={busyId === c.id}
                onClick={() => void confirmSigned(c.id)}
              >
                {busyId === c.id ? 'Saving…' : 'I’ve signed — confirm'}
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
