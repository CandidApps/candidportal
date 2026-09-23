'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  disconnectSharedMailbox,
  disconnectZoho,
  fetchSharedMailboxStatus,
  fetchZohoConnection,
  zohoOAuthStartUrl,
  type TeamMailboxRow,
  type ZohoConnectionStatus,
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

/** Admin Settings: shared Zoho mailbox + personal mailbox + team visibility. */
export function AdminSharedMailboxSettings() {
  const [status, setStatus] = useState<ZohoSharedMailboxResponse | null>(null);
  const [personal, setPersonal] = useState<ZohoConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'ok' | 'warn' | 'error'>('ok');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextShared, nextPersonal] = await Promise.all([
        fetchSharedMailboxStatus(),
        fetchZohoConnection(),
      ]);
      setStatus(nextShared);
      setPersonal(nextPersonal);
    } catch (err) {
      setStatus(null);
      setPersonal(null);
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
    } else if (zoho === 'connected') {
      setNotice('Your personal mailbox is connected.');
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

  const connectPersonal = () => {
    window.location.href = zohoOAuthStartUrl({ returnTo: 'adminsettings' });
  };

  const disconnectShared = async () => {
    if (
      !window.confirm(
        'Disconnect the shared system mailbox? Portal invite emails will stop until a new shared mailbox is connected. Personal mailboxes are not affected.',
      )
    ) {
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

  const disconnectPersonal = async () => {
    if (!window.confirm('Disconnect your personal Zoho mailbox? Compose and SCOUT will stop until you reconnect.')) {
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      await disconnectZoho();
      setNotice('Personal mailbox disconnected.');
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
  const canManageShared = Boolean(status?.canManageShared);
  const emailMatchesInvite =
    shared?.email?.trim().toLowerCase() === inviteFrom.toLowerCase();
  const personalConn = personal?.connection;
  const team: TeamMailboxRow[] = status?.teamMailboxes ?? [];

  return (
    <>
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-header">
          <div className="card-title">Shared system mailbox</div>
        </div>
        <div className="card-body">
          <p className="settings-section-desc">
            Portal invite emails, member notifications, and other automated outbound mail send through
            this Zoho mailbox. Connect <strong>{inviteFrom}</strong> (or an account allowed to send as
            that address). This is separate from each teammate&apos;s personal mailbox.
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
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>
                    {shared.displayName}
                  </div>
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
                    Invites send as <strong>{inviteFrom}</strong>. Ensure this Zoho account can send
                    from that address, or reconnect using {inviteFrom}.
                  </p>
                ) : null}
                {!canManageShared ? (
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--gray)' }}>
                    Read-only — only the teammate who connected this mailbox can reconnect or
                    disconnect it. Connect your own mailbox in the section below.
                  </p>
                ) : null}
              </div>
              {canManageShared ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="assist-mini-btn primary"
                    disabled={busy}
                    onClick={connectShared}
                  >
                    <AppIcon name="email" size={11} />{' '}
                    {shared.active ? 'Reconnect' : 'Reconnect shared mailbox'}
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
              ) : null}
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
                No shared mailbox connected yet. Portal invites cannot be emailed until one is
                connected.
              </p>
              {canManageShared ? (
                <button type="button" className="assist-mini-btn primary" onClick={connectShared}>
                  <AppIcon name="email" size={11} /> Connect {inviteFrom} as shared mailbox
                </button>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--gray)' }}>
                  Ask a shared-mailbox manager to connect {inviteFrom}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-header">
          <div className="card-title">Your personal mailbox</div>
        </div>
        <div className="card-body">
          <p className="settings-section-desc">
            Your Zoho mailbox for compose, SCOUT, and account email. Connecting here never changes
            the shared system mailbox above.
          </p>
          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>Checking…</p>
          ) : !personal?.configured ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>Zoho is not configured on this server.</p>
          ) : personalConn ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: 14,
                borderRadius: 8,
                border: `1px solid ${personalConn.active ? 'var(--gray-border)' : '#fcd34d'}`,
                background: personalConn.active ? 'var(--card-bg, #fff)' : '#fffbeb',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: personalConn.active ? 'var(--green, #16A34A)' : '#d97706',
                      flexShrink: 0,
                    }}
                  />
                  <strong style={{ fontSize: 14 }}>{personalConn.email ?? 'Unknown mailbox'}</strong>
                </div>
                {personalConn.displayName ? (
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 4 }}>
                    {personalConn.displayName}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: 'var(--gray)' }}>
                  Connected {formatConnectedAt(personalConn.connectedAt)}
                </div>
                {!personalConn.active ? (
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: '#b45309' }}>
                    Token expired — reconnect to restore compose and SCOUT.
                  </p>
                ) : null}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  className="assist-mini-btn primary"
                  disabled={busy}
                  onClick={connectPersonal}
                >
                  <AppIcon name="email" size={11} />{' '}
                  {personalConn.active ? 'Reconnect' : 'Reconnect mailbox'}
                </button>
                <button
                  type="button"
                  className="assist-mini-btn"
                  disabled={busy}
                  onClick={() => void disconnectPersonal()}
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
                No personal mailbox connected. Connect your Zoho account to send and read mail in the
                portal.
              </p>
              <button type="button" className="assist-mini-btn primary" onClick={connectPersonal}>
                <AppIcon name="email" size={11} /> Connect my mailbox
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div className="card-header">
          <div className="card-title">Candid team mailboxes</div>
        </div>
        <div className="card-body">
          <p className="settings-section-desc">
            After a teammate connects their personal Zoho mailbox, their working address appears here
            for the team.
          </p>
          {loading ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading team…</p>
          ) : team.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--gray)' }}>No team members found.</p>
          ) : (
            <table className="admin-mini-table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Teammate</th>
                  <th style={{ textAlign: 'left' }}>Login</th>
                  <th style={{ textAlign: 'left' }}>Zoho mailbox</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {team.map((row) => (
                  <tr key={row.userId}>
                    <td>
                      {row.name}
                      {row.isYou ? (
                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--gray)' }}>(you)</span>
                      ) : null}
                    </td>
                    <td style={{ color: 'var(--gray)' }}>{row.loginEmail}</td>
                    <td>
                      {row.mailboxEmail ? (
                        <strong>{row.mailboxEmail}</strong>
                      ) : (
                        <span style={{ color: 'var(--gray)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {row.connected ? (
                        <span style={{ color: 'var(--green, #16A34A)', fontWeight: 600 }}>Connected</span>
                      ) : (
                        <span style={{ color: 'var(--gray)' }}>Not connected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

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
    </>
  );
}
