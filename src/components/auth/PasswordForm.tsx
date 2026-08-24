'use client';

import { useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { updateAccountPassword } from '@/lib/auth/password';

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="settings-password-field">
      <label className="settings-field-label">{label}</label>
      <div className="settings-password-wrap">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="settings-input settings-password-input"
          autoComplete={autoComplete}
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

export function PasswordForm({
  mode,
  submitLabel,
  onSuccess,
}: {
  mode: 'create' | 'change';
  submitLabel?: string;
  onSuccess?: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const result = await updateAccountPassword({
        mode,
        newPassword,
        confirmPassword,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNewPassword('');
      setConfirmPassword('');
      setNotice(mode === 'create' ? 'Password saved.' : 'Password updated.');
      onSuccess?.();
    } catch {
      setError('Could not update password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PasswordInput
        label={mode === 'create' ? 'Password' : 'New Password'}
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
      />
      <PasswordInput
        label="Confirm Password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
      />
      {error ? <div className="settings-form-error">{error}</div> : null}
      {notice ? <div className="settings-form-success">{notice}</div> : null}
      <button
        type="button"
        className="btn-primary settings-save-btn"
        disabled={saving}
        onClick={() => void submit()}
      >
        {saving ? 'Saving…' : submitLabel ?? (mode === 'create' ? 'Create password' : 'Update Password')}
      </button>
    </div>
  );
}
