'use client';

import { useEffect, useState } from 'react';
import { commissionPortalUrl } from '@/lib/commissions/commission-portal';
import { fetchPartnerSuppliers } from '@/lib/services/bank-deposits';
import type { SupplierId } from '@/lib/commissions/supplier-config';

export function OpenCommissionPortalButton({
  supplierId,
  paySourceLabel,
  className = 'admin-ticket-btn',
  style,
}: {
  supplierId?: SupplierId | null;
  paySourceLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPartnerSuppliers()
      .then((partners) => {
        if (cancelled) return;
        setUrl(commissionPortalUrl(partners, { supplierId, paySourceLabel }));
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, paySourceLabel]);

  if (!url) return null;

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
    >
      Open commission portal
    </button>
  );
}

export default OpenCommissionPortalButton;
