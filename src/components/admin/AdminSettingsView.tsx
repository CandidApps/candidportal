'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AssistantContextItem } from '@/lib/assistant/types';
import { RichTextField } from '@/components/admin/RichTextField';
import {
  fetchMeetingSettings,
  saveMeetingSettings,
  MEETING_ATTACHMENT_UPLOAD_URL,
} from '@/lib/assistant/meeting-settings';

const NOTIFICATION_TYPES: { id: string; label: string; sub: string }[] = [
  { id: 'mentions', label: 'Mentions', sub: 'When a teammate @mentions you' },
  { id: 'assigned', label: 'Assigned tasks & actions', sub: 'When work is assigned to you' },
  { id: 'replies', label: 'Replies', sub: 'Replies on your tickets and threads' },
  { id: 'calls', label: 'Calls & voicemails', sub: 'Missed calls and new voicemails' },
  { id: 'critical_emails', label: 'Critical emails', sub: 'Emails flagged as urgent' },
];
const CHANNELS: { id: string; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'portal', label: 'Portal' },
  { id: 'push', label: 'Push' },
];

function defaultPrefs(): Record<string, boolean> {
  const p: Record<string, boolean> = {};
  for (const t of NOTIFICATION_TYPES) {
    p[`${t.id}.email`] = true;
    p[`${t.id}.portal`] = true;
    p[`${t.id}.push`] = false;
  }
  return p;
}

/** Convert a base64url VAPID key to the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function prepareServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  await registration.update();
  await navigator.serviceWorker.ready;
  return registration;
}

async function showLocalTestNotification(registration: ServiceWorkerRegistration): Promise<boolean> {
  try {
    const icon = `${window.location.origin}/brand/candid-icon.png`;
    await registration.showNotification('Candid test notification', {
      body: 'Push notifications are working on this device.',
      icon,
      badge: icon,
      tag: 'candid-test-push',
      renotify: true,
      data: { url: '/admin' },
    } as NotificationOptions & { renotify?: boolean });
    return true;
  } catch {
    return false;
  }
}

function PasswordField({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="settings-password-field">
      <label className="settings-field-label">{label}</label>
      <div className="settings-password-wrap">
        <input type={visible ? 'text' : 'password'} placeholder="••••••••" className="settings-input settings-password-input" />
        <button type="button" className="settings-password-toggle" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>
          <AppIcon name={visible ? 'eyeOff' : 'eye'} size={16} />
        </button>
      </div>
    </div>
  );
}

/** Admin settings mirroring the customer settings: password, notification
 *  channels (email/portal/push), and AI training management (TASK-034). */
export function AdminSettingsView() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(defaultPrefs);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');

  const [training, setTraining] = useState<AssistantContextItem[]>([]);
  const [trainLoading, setTrainLoading] = useState(true);
  const [newSubject, setNewSubject] = useState('');
  const [newInfo, setNewInfo] = useState('');
  const [newScope, setNewScope] = useState<'personal' | 'team'>('personal');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInfo, setEditInfo] = useState('');

  const [meetingLink, setMeetingLink] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [meetingNotice, setMeetingNotice] = useState('');

  const loadPrefs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notification-preferences');
      if (res.ok) {
        const data = (await res.json()) as { preferences?: Record<string, boolean> };
        if (data.preferences && Object.keys(data.preferences).length) {
          setPrefs({ ...defaultPrefs(), ...data.preferences });
        }
      }
    } catch {
      /* keep defaults */
    }
  }, []);

  const loadTraining = useCallback(async () => {
    setTrainLoading(true);
    try {
      const res = await fetch('/api/admin/assistant/context');
      if (res.ok) {
        const data = (await res.json()) as { items?: AssistantContextItem[] };
        setTraining(data.items ?? []);
      }
    } finally {
      setTrainLoading(false);
    }
  }, []);

  const loadMeeting = useCallback(async () => {
    const s = await fetchMeetingSettings();
    setMeetingLink(s.meetingLink);
    setMeetingDescription(s.meetingDescription);
  }, []);

  useEffect(() => {
    void loadPrefs();
    void loadTraining();
    void loadMeeting();
    void fetch('/api/admin/push/subscribe')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { subscribed?: boolean } | null) => {
        if (data?.subscribed) setPushSubscribed(true);
      })
      .catch(() => {});
  }, [loadPrefs, loadTraining, loadMeeting]);

  const saveMeeting = useCallback(async () => {
    setMeetingSaving(true);
    setMeetingNotice('');
    try {
      await saveMeetingSettings({ meetingLink: meetingLink.trim(), meetingDescription });
      setMeetingNotice('Meeting settings saved.');
    } catch (e) {
      setMeetingNotice(e instanceof Error ? e.message : 'Could not save meeting settings.');
    } finally {
      setMeetingSaving(false);
    }
  }, [meetingLink, meetingDescription]);

  const savePrefs = useCallback(async (next: Record<string, boolean>) => {
    await fetch('/api/admin/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: next }),
    }).catch(() => {});
  }, []);

  const togglePref = (key: string) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      void savePrefs(next);
      return next;
    });
  };

  const enablePush = async () => {
    setPushMsg('');
    if (typeof window === 'undefined' || typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
      setPushMsg('This browser does not support push notifications.');
      return;
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setPushMsg('Push is not configured on the server yet (missing VAPID key).');
      return;
    }
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushMsg('Notifications are blocked. Allow them in your browser settings, then try again.');
        return;
      }
      // Ensure the service worker is active and up to date.
      const registration = await prepareServiceWorker();

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });
      }

      const res = await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Could not register this device.');
      }
      setPushSubscribed(true);
      setPushMsg('Push notifications enabled on this device.');
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : 'Could not enable push notifications.');
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPush = async () => {
    setPushMsg('');
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setPushMsg('This browser does not support push notifications.');
      return;
    }
    setPushTestBusy(true);
    try {
      const registration = await prepareServiceWorker();
      const res = await fetch('/api/admin/push/test', { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
        pruned?: number;
      };
      if (!res.ok) throw new Error(json.error ?? 'Test push failed');
      const shown = await showLocalTestNotification(registration);
      const extra = json.pruned ? ` (${json.pruned} stale subscription${json.pruned === 1 ? '' : 's'} removed)` : '';
      if (shown) {
        setPushMsg(
          `Test notification sent${extra}. If you do not see a banner, open macOS Notification Center — Chrome often hides alerts while this tab is focused.`,
        );
      } else {
        setPushMsg(
          `Push service accepted the message${extra}, but this browser could not display it. Check System Settings → Notifications → Google Chrome, and ensure notifications are allowed for candidiq.app.`,
        );
      }
    } catch (e) {
      setPushMsg(e instanceof Error ? e.message : 'Test push failed');
    } finally {
      setPushTestBusy(false);
    }
  };

  const addTraining = async () => {
    if (!newSubject.trim() || !newInfo.trim()) return;
    const res = await fetch('/api/admin/assistant/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: newSubject.trim(), info: newInfo.trim(), scope: newScope }),
    });
    if (res.ok) {
      setNewSubject('');
      setNewInfo('');
      await loadTraining();
    }
  };

  const saveEdit = async (id: string) => {
    await fetch(`/api/admin/assistant/context/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ info: editInfo }),
    }).catch(() => {});
    setEditingId(null);
    await loadTraining();
  };

  const deleteTraining = async (id: string) => {
    setTraining((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/admin/assistant/context/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  return (
    <>
      <div className="greeting">
        <h2>Admin <span style={{ color: 'var(--red)' }}>Settings</span></h2>
        <p>Manage your password, meeting details, notification preferences, and what you&apos;ve taught Hank.</p>
      </div>

      <div className="settings-grid">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header"><div className="card-title">Notifications</div></div>
          <div className="card-body">
            <p className="settings-section-desc">Choose how you&apos;re notified for each type. Push notifications are a new channel — enable them on this device first.</p>
            <div className="settings-push-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: pushMsg ? 8 : 14 }}>
              {!pushSubscribed && (
                <button type="button" className="assist-mini-btn primary" disabled={pushBusy} onClick={() => void enablePush()}>
                  <AppIcon name="alerts" size={11} /> {pushBusy ? 'Enabling…' : 'Enable push on this device'}
                </button>
              )}
              {pushSubscribed && (
                <button type="button" className="assist-mini-btn primary" disabled={pushTestBusy} onClick={() => void sendTestPush()}>
                  <AppIcon name="send" size={11} /> {pushTestBusy ? 'Sending…' : 'Send test push'}
                </button>
              )}
            </div>
            {pushMsg && (
              <p className="settings-section-desc" style={{ marginBottom: 14, color: pushMsg.toLowerCase().includes('fail') || pushMsg.includes('No push') ? 'var(--red)' : 'var(--green)' }}>{pushMsg}</p>
            )}
            <table className="notif-matrix">
              <thead>
                <tr>
                  <th>Notification</th>
                  {CHANNELS.map((c) => <th key={c.id} className="notif-matrix-ch">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_TYPES.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="notif-type-label">{t.label}</div>
                      <div className="notif-type-sub">{t.sub}</div>
                    </td>
                    {CHANNELS.map((c) => {
                      const key = `${t.id}.${c.id}`;
                      return (
                        <td key={c.id} className="notif-matrix-ch">
                          <input
                            type="checkbox"
                            checked={Boolean(prefs[key])}
                            onChange={() => togglePref(key)}
                            aria-label={`${t.label} ${c.label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header"><div className="card-title">Meeting settings</div></div>
          <div className="card-body">
            <p className="settings-section-desc">
              Save your personal video meeting link (e.g. your Dialpad meeting room) and a default
              description. Use <strong>Insert conference</strong> on the new-event popup to drop these
              into a meeting&apos;s link, location, and description.
            </p>
            <label className="settings-field-label" htmlFor="meeting-link">Meeting link</label>
            <input
              id="meeting-link"
              className="settings-input"
              value={meetingLink}
              onChange={(e) => { setMeetingLink(e.target.value); setMeetingNotice(''); }}
              placeholder="https://meetings.dialpad.com/your-room"
            />
            <label className="settings-field-label" style={{ marginTop: 14 }}>Meeting description</label>
            <RichTextField
              value={meetingDescription}
              onChange={(html) => { setMeetingDescription(html); setMeetingNotice(''); }}
              uploadUrl={MEETING_ATTACHMENT_UPLOAD_URL}
              placeholder="Add agenda, dial-in details, links, or attachments…"
            />
            <div className="settings-meeting-foot">
              {meetingNotice && <span className="settings-meeting-notice">{meetingNotice}</span>}
              <button
                type="button"
                className="btn-primary settings-save-btn"
                disabled={meetingSaving}
                onClick={() => void saveMeeting()}
              >
                {meetingSaving ? 'Saving…' : 'Save meeting settings'}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Security</div></div>
          <div className="card-body">
            <PasswordField label="Current Password" />
            <PasswordField label="New Password" />
            <PasswordField label="Confirm New Password" />
            <button type="button" className="btn-primary settings-save-btn">Update Password</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">AI training</div></div>
          <div className="card-body">
            <p className="settings-section-desc">Everything you&apos;ve taught Hank. Edit, delete, or add new facts.</p>
            {trainLoading ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading…</p>
            ) : training.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>Nothing trained yet.</p>
            ) : (
              <div className="train-list">
                {training.map((t) => (
                  <div key={t.id} className="train-row">
                    <div className="train-row-head">
                      <span className="train-subject">{t.subject}</span>
                      <span className={`train-scope train-scope--${t.scope}`}>{t.scope}</span>
                    </div>
                    {editingId === t.id ? (
                      <div className="train-edit">
                        <textarea className="settings-input" rows={2} value={editInfo} onChange={(e) => setEditInfo(e.target.value)} />
                        <div className="train-edit-actions">
                          <button type="button" className="assist-mini-btn" onClick={() => setEditingId(null)}>Cancel</button>
                          <button type="button" className="assist-mini-btn primary" onClick={() => void saveEdit(t.id)}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="train-info">{t.info}</div>
                        <div className="train-actions">
                          <button type="button" className="assist-mini-btn" onClick={() => { setEditingId(t.id); setEditInfo(t.info); }}>Edit</button>
                          <button type="button" className="assist-mini-btn danger" onClick={() => void deleteTraining(t.id)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="train-add">
              <input className="settings-input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Subject (e.g. Acme Corp)" />
              <textarea className="settings-input" rows={2} value={newInfo} onChange={(e) => setNewInfo(e.target.value)} placeholder="What should Hank know?" />
              <div className="train-add-foot">
                <select className="settings-input train-scope-select" value={newScope} onChange={(e) => setNewScope(e.target.value as 'personal' | 'team')}>
                  <option value="personal">Just me</option>
                  <option value="team">Whole team</option>
                </select>
                <button type="button" className="assist-mini-btn primary" disabled={!newSubject.trim() || !newInfo.trim()} onClick={() => void addTraining()}>
                  <AppIcon name="add" size={11} /> Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
