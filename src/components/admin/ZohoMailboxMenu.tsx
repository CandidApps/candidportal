'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  disconnectZoho,
  fetchZohoConnection,
  zohoOAuthStartUrl,
  type ZohoConnectionStatus,
} from '@/lib/email/client';

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
    return (
      <div className="zoho-menu-block">
        <div className="zoho-menu-label">
          <AppIcon name="email" size={13} /> Zoho Mailbox
        </div>
        <div className="zoho-menu-status" style={{ fontSize: 12, color: 'var(--gray)' }}>
          Zoho is not configured on this server.
        </div>
      </div>
    );
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
            <span className={`zoho-menu-dot ${conn.active ? 'connected' : ''}`} /> {conn.email}
            {conn.isShared ? <span className="zoho-menu-tag">Shared</span> : null}
          </div>
          {!conn.active ? (
            <div className="zoho-menu-status" style={{ color: 'var(--warn, #b45309)', fontSize: 12 }}>
              Token expired — reconnect to restore mailbox access.
            </div>
          ) : null}
          <button
            type="button"
            className="zoho-menu-action"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>
          {!conn.active ? (
            <button
              type="button"
              className="zoho-menu-action primary"
              onClick={() => {
                window.location.href = zohoOAuthStartUrl({ shared: conn.isShared });
              }}
            >
              Reconnect mailbox
            </button>
          ) : null}
          {conn.isShared ? (
            <div className="zoho-menu-status" style={{ fontSize: 11, color: 'var(--gray)' }}>
              Shared mailbox settings → Admin Settings
            </div>
          ) : null}
        </>
      ) : (
        <>
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
          {!status.sharedConfigured ? (
            <div className="zoho-menu-status" style={{ fontSize: 11, color: 'var(--gray)' }}>
              For portal invites, use Admin Settings → Shared system mailbox
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
