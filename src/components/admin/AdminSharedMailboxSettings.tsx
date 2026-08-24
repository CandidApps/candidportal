'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  disconnectSharedMailbox,
  fetchSharedMailboxStatus,
  zohoOAuthStartUrl,
  type ZohoSharedMailboxResponse,
} from '@/lib/email/client';

function formatConnectedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Admin Settings: shared Zoho mailbox used for portal invites and system email. */
export function AdminSharedMailboxSettings() {
  const [status, setStatus] = useState<ZohoSharedMailboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'ok' | 'warn' | 'error'>('ok');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchSharedMailboxStatus();
      setStatus(next);
    } catch (err) {
      setStatus(null);
      setNotice(err instanceof Error ? err.message : 'Could not load mailbox status');
      setNoticeTone('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const zoho = params.get('zoho');
    const zohoShared = params.get('zoho_shared') === '1';
    const zohoMsg = params.get('zoho_msg');
    if (!zoho) return;

    if (zoho === 'connected' && zohoShared) {
      setNotice('Shared mailbox connected. Portal invites will send from the address shown below.');
      setNoticeTone('ok');
      void load();
    } else if (zoho === 'error') {
      setNotice(zohoMsg ? decodeURIComponent(zohoMsg) : 'Zoho connection failed.');
      setNoticeTone('error');
    }

    params.delete('zoho');
    params.delete('zoho_shared');
    params.delete('zoho_msg');
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [load]);

  const connectShared = () => {
    window.location.href = zohoOAuthStartUrl({ shared: true, returnTo: 'adminsettings' });
  };

  const disconnectShared = async () => {
    if (!window.confirm('Disconnect the shared system mailbox? Portal invite emails will stop until a new shared mailbox is connected.')) {
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      await disconnectSharedMailbox();
      setNotice('Shared mailbox disconnected.');
      setNoticeTone('ok');
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Disconnect failed');
      setNoticeTone('error');
    } finally {
      setBusy(false);
    }
  };

  const inviteFrom = status?.inviteFrom ?? 'support@candid.solutions';
  const shared = status?.shared;
  const emailMatchesInvite =
    shared?.email?.trim().toLowerCase() === inviteFrom.toLowerCase();

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card-header">
        <div className="card-title">Shared system mailbox</div>
      </div>
      <div className="card-body">
        <p className="settings-section-desc">
          Portal invite emails, member notifications, and other automated outbound mail send through
          this Zoho mailbox. Connect <strong>{inviteFrom}</strong> (or an account allowed to send as
          that address).
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--gray)' }}>Checking mailbox status…</p>
        ) : !status?.zohoConfigured ? (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              border: '1px solid var(--gray-border)',
              background: 'var(--surface-muted, #f8fafc)',
              fontSize: 13,
              color: 'var(--gray-dark)',
            }}
          >
            <strong>Zoho is not configured on this server.</strong>
            <p style={{ margin: '8px 0 0', color: 'var(--gray)' }}>
              Set <code>ZOHO_CLIENT_ID</code>, <code>ZOHO_CLIENT_SECRET</code>, and{' '}
              <code>ZOHO_TOKEN_ENC_KEY</code> in the deployment environment, then reload this page.
            </p>
          </div>
        ) : shared ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              padding: 14,
              borderRadius: 8,
              border: `1px solid ${shared.active ? 'var(--gray-border)' : '#fcd34d'}`,
              background: shared.active ? 'var(--card-bg, #fff)' : '#fffbeb',
            }}
          >
            <div style={{ minWidth: 0, flex: '1 1 240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: shared.active ? 'var(--green, #16A34A)' : '#d97706',
                    flexShrink: 0,
                  }}
                />
                <strong style={{ fontSize: 14 }}>{shared.email ?? 'Unknown mailbox'}</strong>
                <span className="zoho-menu-tag">Shared</span>
              </div>
              {shared.displayName ? (
                <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>{shared.displayName}</div>
              ) : null}
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                Connected {formatConnectedAt(shared.connectedAt)}
              </div>
              {!shared.active ? (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#b45309' }}>
                  Token expired or invalid — reconnect to restore portal invite delivery.
                </p>
              ) : null}
              {!emailMatchesInvite && shared.email ? (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: '#b45309' }}>
                  Invites send as <strong>{inviteFrom}</strong>. Ensure this Zoho account can send from
                  that address, or reconnect using {inviteFrom}.
                </p>
              ) : null}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="assist-mini-btn primary"
                disabled={busy}
                onClick={connectShared}
              >
                <AppIcon name="email" size={11} /> {shared.active ? 'Reconnect' : 'Reconnect shared mailbox'}
              </button>
              <button
                type="button"
                className="assist-mini-btn"
                disabled={busy}
                onClick={() => void disconnectShared()}
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              border: '1px dashed var(--gray-border)',
              background: 'var(--surface-muted, #f8fafc)',
            }}
          >
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--gray-dark)' }}>
              No shared mailbox connected yet. Portal invites cannot be emailed until you connect one.
            </p>
            <button type="button" className="assist-mini-btn primary" onClick={connectShared}>
              <AppIcon name="email" size={11} /> Connect {inviteFrom} as shared mailbox
            </button>
          </div>
        )}

        <p className="settings-section-desc" style={{ marginTop: 14, marginBottom: 0 }}>
          Your personal Zoho mailbox (for compose and SCOUT) is separate — connect it from the avatar
          menu (top-right) → Zoho Mailbox → Connect my mailbox.
        </p>

        {notice ? (
          <p
            className="settings-section-desc"
            style={{
              marginTop: 12,
              marginBottom: 0,
              color:
                noticeTone === 'error'
                  ? 'var(--red)'
                  : noticeTone === 'warn'
                    ? '#b45309'
                    : 'var(--green)',
            }}
          >
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
