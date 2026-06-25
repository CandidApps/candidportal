'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { disconnectZoho, fetchZohoConnection, type ZohoConnectionStatus } from '@/lib/email/client';

export function ZohoMailboxMenu() {
  const [status, setStatus] = useState<ZohoConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchZohoConnection()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  const connect = (shared: boolean) => {
    window.location.href = `/api/zoho/oauth/start${shared ? '?shared=1' : ''}`;
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectZoho();
      const next = await fetchZohoConnection();
      setStatus(next);
    } catch {
      // ignore — UI will simply not change
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="zoho-menu-block">
        <div className="zoho-menu-label">
          <AppIcon name="email" size={13} /> Mailbox
        </div>
        <div className="zoho-menu-status">Checking…</div>
      </div>
    );
  }

  if (!status?.configured) {
    return null;
  }

  const conn = status.connection;

  return (
    <div className="zoho-menu-block">
      <div className="zoho-menu-label">
        <AppIcon name="email" size={13} /> Zoho Mailbox
      </div>
      {conn ? (
        <>
          <div className="zoho-menu-status">
            <span className="zoho-menu-dot connected" /> {conn.email}
            {conn.isShared ? <span className="zoho-menu-tag">Shared</span> : null}
          </div>
          <button
            type="button"
            className="zoho-menu-action"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>
        </>
      ) : (
        <>
          <div className="zoho-menu-status">
            <span className="zoho-menu-dot" /> Not connected
          </div>
          <button type="button" className="zoho-menu-action primary" onClick={() => connect(false)}>
            Connect my mailbox
          </button>
          {!status.sharedConfigured ? (
            <button type="button" className="zoho-menu-action" onClick={() => connect(true)}>
              Connect as shared system mailbox
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
