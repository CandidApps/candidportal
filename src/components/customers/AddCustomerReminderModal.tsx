'use client';

import React, { useMemo, useState } from 'react';
import type { CandidContractRecord } from '@/lib/customer-records';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import type { Contact, Customer } from '@/components/CustomersView';
import type { CreateCustomerReminderInput, CustomerReminderKind } from '@/lib/customer-reminders/types';
import { REMINDER_KIND_LABELS } from '@/lib/customer-reminders/types';

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
      className="modal-overlay open"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-box crm-reminder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-reminder-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title" id="crm-reminder-modal-title">
              Add {REMINDER_KIND_LABELS[kind].toLowerCase()}
            </div>
            <div className="modal-subtitle">
              {customer.company}
              {contract ? ` · ${contractServiceTitle(contract)}` : ''}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body crm-reminder-modal-body">
          <label className="form-group">
            <span className="form-label">Type</span>
            <select
              className="form-input"
              value={kind}
              onChange={(e) => setKind(e.target.value as CustomerReminderKind)}
            >
              <option value="task">Task</option>
              <option value="reminder">Reminder</option>
              <option value="calendar">Add to calendar</option>
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Title *</span>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Review renewal terms before call"
            />
          </label>

          <label className="form-group">
            <span className="form-label">Notes</span>
            <textarea
              className="form-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Optional details for your team or the customer…"
            />
          </label>

          {kind === 'calendar' ? (
            <div className="crm-reminder-datetime-grid">
              <label className="form-group">
                <span className="form-label">Start *</span>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={calendarStart}
                  onChange={(e) => setCalendarStart(e.target.value)}
                />
              </label>
              <label className="form-group">
                <span className="form-label">End</span>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={calendarEnd}
                  onChange={(e) => setCalendarEnd(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <label className="form-group">
              <span className="form-label">Due date</span>
              <input
                className="form-input"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
          )}

          <div className="crm-reminder-notify-panel">
            <div className="crm-reminder-notify-title">Customer notifications</div>
            {contactsWithEmail.length > 0 ? (
              <label className="form-group">
                <span className="form-label">Contact</span>
                <select
                  className="form-input"
                  value={contactEmail}
                  onChange={(e) => {
                    const email = e.target.value;
                    setContactEmail(email);
                    const ct = contactsWithEmail.find((c) => c.email === email);
                    if (ct && !ct.portalAccess) setNotifyPortal(false);
                  }}
                >
                  {contactsWithEmail.map((c) => (
                    <option key={c.id} value={c.email}>
                      {c.name} ({c.email}){c.portalAccess ? ' — portal' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-muted crm-reminder-notify-hint">
                No contacts with email on file — add a contact to notify the customer.
              </p>
            )}

            <label className="crm-reminder-checkbox">
              <input
                type="checkbox"
                checked={notifyPortal}
                disabled={!canNotifyPortal}
                onChange={(e) => setNotifyPortal(e.target.checked)}
              />
              <span>
                <strong>Remind on customer portal</strong>
                <span className="crm-reminder-checkbox-hint">
                  {canNotifyPortal
                    ? 'Shows in Alerts & Actions on their portal.'
                    : 'Selected contact does not have portal access.'}
                </span>
              </span>
            </label>

            <label className="crm-reminder-checkbox">
              <input
                type="checkbox"
                checked={notifyEmail}
                disabled={!contactEmail.trim()}
                onChange={(e) => setNotifyEmail(e.target.checked)}
              />
              <span>
                <strong>Remind via email</strong>
                <span className="crm-reminder-checkbox-hint">
                  Sends a notification email when email delivery is configured.
                </span>
              </span>
            </label>
          </div>

          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Saving…' : `Save ${REMINDER_KIND_LABELS[kind].toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export { toDatetimeLocalValue, fromDatetimeLocalValue };
