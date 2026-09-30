'use client';

import { useEffect, useState } from 'react';
import {
  CAMPAIGN_SOURCE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  campaignStatus,
  type IncentiveCampaign,
} from '@/lib/incentive-campaigns';
import { fetchCampaigns } from '@/lib/incentive-campaigns-client';

/** Read-only list of this supplier's promos / SPIFFs; editing lives in Partners → Promos & SPIFFs. */
export function SupplierCampaignsSummary({ providerDbId }: { providerDbId?: number }) {
  const [campaigns, setCampaigns] = useState<IncentiveCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerDbId) return;
    let cancelled = false;
    fetchCampaigns(providerDbId)
      .then((rows) => {
        if (!cancelled) setCampaigns(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load promos');
      });
    return () => {
      cancelled = true;
    };
  }, [providerDbId]);

  return (
    <div
      style={{
        marginBottom: 18,
        marginTop: 6,
        padding: '14px 14px 12px',
        border: '1px solid var(--gray-border)',
        borderRadius: 10,
        background: 'var(--surface-muted, #f8f8f8)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-dark)', letterSpacing: 0.2 }}>
        Promos & SPIFFs
      </div>
      <p style={{ margin: '6px 0 10px', fontSize: 11, color: 'var(--gray)', lineHeight: 1.45 }}>
        Add or edit promos in <strong>Partners → Promos & SPIFFs</strong>. Active, customer-facing items show on this
        supplier&apos;s Find Solutions card.
      </p>
      {!providerDbId ? (
        <div style={{ fontSize: 12, color: 'var(--gray)' }}>Save the supplier first to attach promos.</div>
      ) : error ? (
        <div style={{ fontSize: 12, color: 'var(--amber)' }}>{error}</div>
      ) : campaigns == null ? (
        <div style={{ fontSize: 12, color: 'var(--gray)' }}>Loading…</div>
      ) : campaigns.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--gray)' }}>No promos for this supplier.</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {campaigns.map((c) => {
            const status = campaignStatus(c);
            return (
              <li key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span className={`campaign-source-badge campaign-source-badge--${c.source}`}>
                  {CAMPAIGN_SOURCE_LABEL[c.source]}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </span>
                <span className={`campaign-status campaign-status--${status}`}>{CAMPAIGN_STATUS_LABEL[status]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
