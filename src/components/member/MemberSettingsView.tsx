'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { Contact } from '@/components/CustomersView';
import {
  MEMBER_EMAIL_NOTIFICATION_KEYS,
  MEMBER_EMAIL_NOTIFICATION_LABELS,
  mergeNotificationPreferences,
  type MemberNotificationPreferences,
} from '@/lib/portal/notification-preferences';

function ToggleRow({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <div>
        <div className="settings-toggle-label">{label}</div>
        <div className="settings-toggle-sub">{sub}</div>
      </div>
      <button
        type="button"
        className={`settings-toggle${value ? ' on' : ''}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
        aria-label={`${label} email notifications ${value ? 'on' : 'off'}`}
      >
        <span className="settings-toggle-knob" />
      </button>
    </div>
  );
}

function PasswordField({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="settings-password-field">
      <label className="settings-field-label">{label}</label>
      <div className="settings-password-wrap">
        <input
          type={visible ? 'text' : 'password'}
          placeholder="••••••••"
          className="settings-input settings-password-input"
        />
        <button
          type="button"
          className="settings-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          <AppIcon name={visible ? 'eyeOff' : 'eye'} size={16} />
        </button>
      </div>
    </div>
  );
}

export function MemberSettingsView({
  name,
  email,
  company,
}: {
  name: string;
  email: string;
  company: string;
}) {
  const [first0, ...rest] = name.split(/\s+/);
  const lastName = rest.join(' ');

  const [prefs, setPrefs] = useState<MemberNotificationPreferences>(() =>
    mergeNotificationPreferences(null),
  );
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);

  const [teamContacts, setTeamContacts] = useState<Contact[]>([]);
  const [teamCompany, setTeamCompany] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [invitePortal, setInvitePortal] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const res = await fetch('/api/portal/notification-preferences');
      if (res.ok) {
        const data = (await res.json()) as { preferences?: Record<string, boolean> };
        setPrefs(mergeNotificationPreferences(data.preferences));
      }
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch('/api/portal/team-members');
      if (res.ok) {
        const data = (await res.json()) as {
          contacts?: Contact[];
          companyName?: string | null;
        };
        setTeamContacts(data.contacts ?? []);
        setTeamCompany(data.companyName ?? null);
      }
    } finally {
      setTeamLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrefs();
    void loadTeam();
  }, [loadPrefs, loadTeam]);

  const setPref = async (key: keyof MemberNotificationPreferences, enabled: boolean) => {
    const prev = prefs;
    setPrefs((p) => ({ ...p, [key]: enabled }));
    setPrefsSaving(true);
    try {
      const res = await fetch('/api/portal/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, enabled }),
      });
      if (res.ok) {
        const data = (await res.json()) as { preferences?: Record<string, boolean> };
        setPrefs(mergeNotificationPreferences(data.preferences));
      } else {
        setPrefs(prev);
      }
    } catch {
      setPrefs(prev);
    } finally {
      setPrefsSaving(false);
    }
  };

  const submitInvite = async () => {
    setInviteError('');
    setInviteSuccess('');
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError('Name and email are required.');
      return;
    }
    setInviteSaving(true);
    try {
      const res = await fetch('/api/portal/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole.trim() || undefined,
          grantPortalAccess: invitePortal,
        }),
      });
      const data = (await res.json()) as { error?: string; contact?: Contact };
      if (!res.ok) {
        setInviteError(data.error ?? 'Could not add team member.');
        return;
      }
      setInviteSuccess(`${inviteName.trim()} was added to your company contacts.`);
      setInviteName('');
      setInviteEmail('');
      setInviteRole('');
      setInvitePortal(false);
      void loadTeam();
    } catch {
      setInviteError('Could not add team member. Please try again.');
    } finally {
      setInviteSaving(false);
    }
  };

  return (
    <>
      <div className="greeting">
        <h2>
          Account <span style={{ color: 'var(--red)' }}>Settings</span>
        </h2>
        <p>Manage your profile, subscription, billing, and notification preferences for {company}.</p>
      </div>

      <div className="settings-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Profile</div>
          </div>
          <div className="card-body">
            {[
              { label: 'First Name', val: first0 ?? '' },
              { label: 'Last Name', val: lastName },
              { label: 'Email', val: email },
              { label: 'Phone', val: '(555) 555-5555' },
            ].map((f) => (
              <div key={f.label} className="settings-field">
                <label className="settings-field-label">{f.label}</label>
                <input defaultValue={f.val} className="settings-input" />
              </div>
            ))}
            <button type="button" className="btn-primary settings-save-btn">
              Save Changes
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Email notifications</div>
          </div>
          <div className="card-body">
            <p className="settings-section-desc">
              Choose which updates we email you about. In-app alerts on your dashboard are not affected.
            </p>
            {prefsLoading ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading preferences…</p>
            ) : (
              MEMBER_EMAIL_NOTIFICATION_KEYS.map((key) => {
                const meta = MEMBER_EMAIL_NOTIFICATION_LABELS[key];
                return (
                  <ToggleRow
                    key={key}
                    label={meta.label}
                    sub={meta.description}
                    value={prefs[key]}
                    onChange={(on) => void setPref(key, on)}
                  />
                );
              })
            )}
            {prefsSaving && (
              <p style={{ fontSize: 11, color: 'var(--gray)', marginTop: 8 }}>Saving…</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Subscription &amp; Billing</div>
          </div>
          <div className="card-body">
            <div className="settings-waived-banner">
              <div className="settings-waived-title">✓ Platform Fee Currently Waived</div>
              <div className="settings-waived-body">
                Active Candid client — $25/mo fee is waived as long as you have at least one active managed
                service.
              </div>
            </div>
            <p className="settings-section-desc" style={{ marginBottom: 0 }}>
              Your Candid Intelligence subscription is <strong>$25/month</strong> billed monthly. Platform fee is
              currently <strong>waived</strong> because you have active managed services.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Security</div>
          </div>
          <div className="card-body">
            <PasswordField label="Current Password" />
            <PasswordField label="New Password" />
            <PasswordField label="Confirm New Password" />
            <button type="button" className="btn-primary settings-save-btn">
              Update Password
            </button>
          </div>
        </div>

        <div className="card settings-team-card">
          <div className="card-header">
            <div className="card-title">Team members</div>
          </div>
          <div className="card-body">
            <p className="settings-section-desc">
              Invite colleagues on your team. They&apos;ll appear under company contacts in your Candid account
              profile{teamCompany ? ` for ${teamCompany}` : ''}.
            </p>

            {teamLoading ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading team…</p>
            ) : teamContacts.length > 0 ? (
              <div className="settings-team-list">
                {teamContacts.map((c) => (
                  <div key={c.id} className="settings-team-row">
                    <div>
                      <div className="settings-team-name">
                        {c.name}
                        {c.isPrimary ? <span className="settings-team-badge">Primary</span> : null}
                        {c.portalAccess ? (
                          <span className="settings-team-badge settings-team-badge--portal">Portal</span>
                        ) : null}
                      </div>
                      <div className="settings-team-meta">
                        {c.role} · {c.email}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16 }}>
                No team contacts on file yet. Add someone below.
              </p>
            )}

            <div className="settings-invite-form">
              <div className="settings-invite-grid">
                <div className="settings-field">
                  <label className="settings-field-label">Name</label>
                  <input
                    className="settings-input"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-field-label">Email</label>
                  <input
                    className="settings-input"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                  />
                </div>
                <div className="settings-field">
                  <label className="settings-field-label">Role (optional)</label>
                  <input
                    className="settings-input"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    placeholder="e.g. CFO, Office Manager"
                  />
                </div>
              </div>
              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={invitePortal}
                  onChange={(e) => setInvitePortal(e.target.checked)}
                />
                <span>Grant portal access (Candid will send an invite when enabled)</span>
              </label>
              {inviteError && <div className="settings-form-error">{inviteError}</div>}
              {inviteSuccess && <div className="settings-form-success">{inviteSuccess}</div>}
              <button
                type="button"
                className="btn-primary settings-save-btn"
                disabled={inviteSaving}
                onClick={() => void submitInvite()}
              >
                {inviteSaving ? 'Adding…' : 'Add team member'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
