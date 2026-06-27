'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AssistantContextItem } from '@/lib/assistant/types';

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
  const [pushEnabled, setPushEnabled] = useState(false);

  const [training, setTraining] = useState<AssistantContextItem[]>([]);
  const [trainLoading, setTrainLoading] = useState(true);
  const [newSubject, setNewSubject] = useState('');
  const [newInfo, setNewInfo] = useState('');
  const [newScope, setNewScope] = useState<'personal' | 'team'>('personal');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInfo, setEditInfo] = useState('');

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

  useEffect(() => {
    void loadPrefs();
    void loadTraining();
    if (typeof Notification !== 'undefined') setPushEnabled(Notification.permission === 'granted');
  }, [loadPrefs, loadTraining]);

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
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setPushEnabled(perm === 'granted');
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
        <p>Manage your password, notification preferences, and what you&apos;ve taught Hank.</p>
      </div>

      <div className="settings-grid">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header"><div className="card-title">Notifications</div></div>
          <div className="card-body">
            <p className="settings-section-desc">Choose how you&apos;re notified for each type. Push notifications are a new channel — enable them on this device first.</p>
            {!pushEnabled && (
              <button type="button" className="assist-mini-btn primary" style={{ marginBottom: 14 }} onClick={() => void enablePush()}>
                <AppIcon name="alerts" size={11} /> Enable push on this device
              </button>
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
