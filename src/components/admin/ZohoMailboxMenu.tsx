'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { fetchZohoConnection, zohoOAuthStartUrl, type ZohoConnectionStatus } from '@/lib/email/client';

/**
 * Avatar-menu connector shown only when the signed-in admin has no personal
 * Zoho mailbox yet. Once connected, manage from Settings.
 */
export function ZohoMailboxMenu() {
  const [status, setStatus] = useState<ZohoConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchZohoConnection()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  // Hide entirely when personal mailbox is already linked.
  if (status?.connection) return null;

  if (!status?.configured) return null;

  return (
    <div className="zoho-menu-block" style={{ borderTop: '1px solid var(--gray-border)' }}>
      <div className="zoho-menu-label">
        <AppIcon name="email" size={13} /> Zoho Mailbox
      </div>
      <div className="zoho-menu-status">
        <span className="zoho-menu-dot" /> Not connected
      </div>
      <button
        type="button"
        className="zoho-menu-action primary"
        onClick={() => {
          window.location.href = zohoOAuthStartUrl();
        }}
      >
        Connect my mailbox
      </button>
      <div className="zoho-menu-status" style={{ fontSize: 11, color: 'var(--gray)' }}>
        For portal invites, use Settings → Shared system mailbox
      </div>
    </div>
  );
}
