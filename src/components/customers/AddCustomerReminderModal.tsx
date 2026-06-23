'use client';

import React, { useMemo, useState } from 'react';
import type { CandidContractRecord } from '@/lib/customer-records';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import type { Contact, Customer } from '@/components/CustomersView';
import type { CreateCustomerReminderInput, CustomerReminderKind } from '@/lib/customer-reminders/types';
import { REMINDER_KIND_LABELS } from '@/lib/customer-reminders/types';

const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
  green: '#1A7A4A',
  blue: '#1D4ED8',
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${BRAND.grayBorder}`,
  borderRadius: 6,
  padding: '10px 12px',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 13,
  color: BRAND.grayDark,
  outline: 'none',
  boxSizing: 'border-box',
};

function primaryContact(contacts: Contact[]): Contact | undefined {
  return contacts.find((c) => c.isPrimary) ?? contacts[0];
}

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export type AddCustomerReminderModalProps = {
  customer: Customer;
  contract?: CandidContractRecord;
  defaultKind?: CustomerReminderKind;
  onClose: () => void;
  onSaved: () => void;
};

export function AddCustomerReminderModal({
  customer,
  contract,
  defaultKind = 'task',
  onClose,
  onSaved,
}: AddCustomerReminderModalProps) {
  const contactsWithEmail = useMemo(
    () => customer.contacts.filter((c) => c.email?.trim()),
    [customer.contacts],
  );
  const defaultContact = primaryContact(contactsWithEmail);

  const [kind, setKind] = useState<CustomerReminderKind>(defaultKind);
  const [title, setTitle] = useState(
    contract ? `Follow up: ${contractServiceTitle(contract)}` : '',
  );
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [calendarStart, setCalendarStart] = useState('');
  const [calendarEnd, setCalendarEnd] = useState('');
  const [contactEmail, setContactEmail] = useState(defaultContact?.email ?? '');
  const [notifyPortal, setNotifyPortal] = useState(Boolean(defaultContact?.portalAccess));
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedContact = contactsWithEmail.find((c) => c.email === contactEmail);
  const canNotifyPortal = Boolean(selectedContact?.portalAccess);

  const submit = async () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (kind === 'calendar' && !calendarStart.trim()) {
      setError('Start date/time is required for calendar events.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: CreateCustomerReminderInput = {
        customerExternalId: customer.id,
        dealExternalId: contract?.id,
        kind,
        title: title.trim(),
        body: body.trim() || undefined,
        dueAt: kind === 'calendar' ? undefined : fromDatetimeLocalValue(dueAt),
        calendarStartAt: kind === 'calendar' ? fromDatetimeLocalValue(calendarStart) : undefined,
        calendarEndAt: kind === 'calendar' ? fromDatetimeLocalValue(calendarEnd) : undefined,
        notifyPortal: notifyPortal && canNotifyPortal,
        notifyEmail,
        contactEmail: contactEmail.trim() || undefined,
      };

      const res = await fetch('/api/admin/crm/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Save failed');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 750,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
    >
      <div
        style={{
          background: BRAND.white,
          borderRadius: 14,
          width: 580,
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ background: BRAND.grayDark, padding: '20px 26px', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})`,
            }}
          />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: BRAND.white }}>
            Add {REMINDER_KIND_LABELS[kind].toLowerCase()}
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
            {customer.company}
            {contract ? ` · ${contractServiceTitle(contract)}` : ''}
          </div>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Type</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CustomerReminderKind)}
              style={inputStyle}
            >
              <option value="task">Task</option>
              <option value="reminder">Reminder</option>
              <option value="calendar">Add to calendar</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Review renewal terms before call"
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Notes</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Optional details for your team or the customer…"
            />
          </div>

          {kind === 'calendar' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Start *</label>
                <input
                  type="datetime-local"
                  value={calendarStart}
                  onChange={(e) => setCalendarStart(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>End</label>
                <input
                  type="datetime-local"
                  value={calendarEnd}
                  onChange={(e) => setCalendarEnd(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Due date</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <div
            style={{
              border: `1px solid ${BRAND.grayBorder}`,
              borderRadius: 8,
              padding: 14,
              background: BRAND.grayLight,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.grayDark, marginBottom: 10 }}>
              Customer notifications
            </div>
            {contactsWithEmail.length > 0 ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: BRAND.gray }}>Contact</label>
                <select
                  value={contactEmail}
                  onChange={(e) => {
                    const email = e.target.value;
                    setContactEmail(email);
                    const ct = contactsWithEmail.find((c) => c.email === email);
                    if (ct && !ct.portalAccess) setNotifyPortal(false);
                  }}
                  style={inputStyle}
                >
                  {contactsWithEmail.map((c) => (
                    <option key={c.id} value={c.email}>
                      {c.name} ({c.email}){c.portalAccess ? ' — portal' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: BRAND.gray, margin: '0 0 10px' }}>
                No contacts with email on file — add a contact to notify the customer.
              </p>
            )}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={notifyPortal}
                disabled={!canNotifyPortal}
                onChange={(e) => setNotifyPortal(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>Remind on customer portal</strong>
                <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
                  {canNotifyPortal
                    ? 'Shows in Alerts & Actions on their portal.'
                    : 'Selected contact does not have portal access.'}
                </div>
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={notifyEmail}
                disabled={!contactEmail.trim()}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong>Remind via email</strong>
                <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
                  Sends a notification email when email delivery is configured.
                </div>
              </span>
            </label>
          </div>

          {error && <p style={{ color: BRAND.red, fontSize: 13, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                background: BRAND.white,
                border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 6,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              style={{
                background: BRAND.red,
                color: BRAND.white,
                border: 'none',
                borderRadius: 6,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : `Save ${REMINDER_KIND_LABELS[kind].toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { toDatetimeLocalValue, fromDatetimeLocalValue };
