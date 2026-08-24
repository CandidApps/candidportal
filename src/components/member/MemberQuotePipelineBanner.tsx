'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  ensurePortalApiCustomerCookie,
  ensurePortalPreviewSession,
  getPortalSessionScope,
} from '@/lib/portal-access';
import {
  pipelineBannerContent,
  type MemberQuotePipelineItem,
} from '@/lib/member-quote-pipeline';

type Props = {
  customerId?: string | null;
  onNavigateSavings?: (publishedQuoteId?: string | null) => void;
  onNavigateServices?: () => void;
};

function scopedCustomerId(prop?: string | null): string | null {
  const fromProp = prop?.trim();
  if (fromProp) return fromProp;
  if (typeof window === 'undefined') return null;
  ensurePortalPreviewSession();
  return getPortalSessionScope()?.customerId?.trim() || null;
}

export function MemberQuotePipelineBanner({
  customerId = null,
  onNavigateSavings,
  onNavigateServices,
}: Props) {
  const [items, setItems] = useState<MemberQuotePipelineItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      ensurePortalPreviewSession();
      const scopedId = scopedCustomerId(customerId);
      ensurePortalApiCustomerCookie(scopedId);
      const qs = new URLSearchParams();
      if (scopedId) qs.set('customerId', scopedId);
      const res = await fetch(`/api/portal/quote-pipeline?${qs.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: MemberQuotePipelineItem[] };
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    }
  }, [customerId]);

  useEffect(() => {
    void refresh();
    const bump = () => void refresh();
    window.addEventListener('candid-contract-updated', bump);
    return () => window.removeEventListener('candid-contract-updated', bump);
  }, [refresh]);

  if (!items.length) return null;

  return (
    <>
      {items.map((item) => {
        const copy = pipelineBannerContent(item);
        const scopedId = scopedCustomerId(customerId);
        const contractHref =
          copy.contractOpenPath && scopedId
            ? `${copy.contractOpenPath}?customerId=${encodeURIComponent(scopedId)}`
            : copy.contractOpenPath;

        const handleClick = () => {
          if (copy.navigate === 'contract' && contractHref) {
            window.open(contractHref, '_blank', 'noopener,noreferrer');
            return;
          }
          if (copy.navigate === 'services') {
            onNavigateServices?.();
            return;
          }
          onNavigateSavings?.(copy.publishedQuoteId);
        };

        return (
          <div
            key={item.id}
            className={`quotes-ready-banner quotes-pipeline-banner quotes-pipeline-banner--${copy.tone}`}
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
          >
            <div className="quotes-ready-banner-icon">
              <AppIcon name={copy.tone === 'action' ? 'file' : 'sparkles'} size={22} />
            </div>
            <div className="quotes-ready-banner-body">
              <div className="quotes-ready-banner-title">{copy.title}</div>
              <div className="quotes-ready-banner-sub">{copy.sub}</div>
            </div>
            <span className="quotes-ready-banner-cta">{copy.cta}</span>
          </div>
        );
      })}
    </>
  );
}
