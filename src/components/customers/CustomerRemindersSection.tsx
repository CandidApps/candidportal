'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { CandidContractRecord } from '@/lib/customer-records';
import { contractServiceTitle } from '@/lib/customer-contracts-from-deals';
import type { Customer } from '@/components/CustomersView';
import {
  buildGoogleCalendarUrl,
  downloadIcsFile,
} from '@/lib/customer-reminders/calendar';
import type { CustomerReminder, CustomerReminderKind } from '@/lib/customer-reminders/types';
import { REMINDER_KIND_LABELS, formatReminderWhen } from '@/lib/customer-reminders/types';

const kindBadgeClass: Record<CustomerReminderKind, string> = {
  task: 'crm-reminder-kind--task',
  reminder: 'crm-reminder-kind--reminder',
  calendar: 'crm-reminder-kind--calendar',
};

export function CustomerRemindersSection({
  customer,
  contracts,
  refreshToken = 0,
  onAdd,
  scrollSection: ScrollSection,
  emptyRow: EmptyRow,
}: {
  customer: Customer;
  contracts: CandidContractRecord[];
  refreshToken?: number;
  onAdd: (kind: CustomerReminderKind, contract?: CandidContractRecord) => void;
  scrollSection: React.ComponentType<{
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
  }>;
  emptyRow: React.ComponentType<{ text: string }>;
}) {
  const [reminders, setReminders] = useState<CustomerReminder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/crm/reminders?customerId=${encodeURIComponent(customer.id)}`);
      const data = (await res.json()) as { reminders?: CustomerReminder[] };
      setReminders(data.reminders ?? []);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const markComplete = async (id: string) => {
    await fetch(`/api/admin/crm/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    void load();
  };

  const openReminders = reminders.filter((r) => r.status === 'open');
  const contractTitle = (dealExternalId?: string) => {
    if (!dealExternalId) return null;
    const ct = contracts.find((c) => c.id === dealExternalId);
    return ct ? contractServiceTitle(ct) : dealExternalId;
  };

  return (
    <ScrollSection
      title="Tasks, reminders & calendar"
      subtitle={
        loading
          ? 'Loading…'
          : `${openReminders.length} open · ${reminders.length} total`
      }
      actions={
        <div className="crm-reminder-actions">
          <button type="button" className="crm-reminder-btn" onClick={() => onAdd('task')}>
            + Task
          </button>
          <button type="button" className="crm-reminder-btn" onClick={() => onAdd('reminder')}>
            + Reminder
          </button>
          <button type="button" className="crm-reminder-btn" onClick={() => onAdd('calendar')}>
            + Calendar
          </button>
        </div>
      }
    >
      {loading ? (
        <EmptyRow text="Loading tasks and reminders…" />
      ) : reminders.length === 0 ? (
        <EmptyRow text="No tasks or reminders yet. Add one for your team or to notify the customer." />
      ) : (
        <div className="crm-reminder-list">
          {reminders.map((r) => {
            const gcal = buildGoogleCalendarUrl(r);
            const linked = contractTitle(r.dealExternalId);
            return (
              <div
                key={r.id}
                className={`crm-reminder-row${r.status === 'completed' ? ' crm-reminder-row--done' : ''}`}
              >
                <div className="crm-reminder-row-main">
                  <div className="crm-reminder-row-content">
                    <div className="crm-reminder-row-badges">
                      <span className={`crm-reminder-kind ${kindBadgeClass[r.kind]}`}>
                        {REMINDER_KIND_LABELS[r.kind]}
                      </span>
                      {r.status === 'completed' && (
                        <span className="crm-reminder-done-badge">Done</span>
                      )}
                      {(r.notifyPortal || r.notifyEmail) && (
                        <span className="crm-reminder-notify-meta">
                          {[
                            r.notifyPortal && r.portalNotifiedAt ? 'Portal notified' : r.notifyPortal ? 'Portal pending' : null,
                            r.notifyEmail && r.emailSentAt ? 'Email sent' : r.notifyEmail ? 'Email pending' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                    <div className="crm-reminder-title">{r.title}</div>
                    {r.body ? <div className="crm-reminder-body">{r.body}</div> : null}
                    <div className="crm-reminder-meta">
                      {formatReminderWhen(r)}
                      {linked ? ` · Contract: ${linked}` : ''}
                      {r.contactEmail ? ` · ${r.contactEmail}` : ''}
                    </div>
                  </div>
                  <div className="crm-reminder-row-actions">
                    {r.kind === 'calendar' && gcal ? (
                      <>
                        <a
                          href={gcal}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="crm-reminder-btn crm-reminder-btn--link"
                        >
                          Google Calendar
                        </a>
                        <button type="button" className="crm-reminder-btn" onClick={() => downloadIcsFile(r)}>
                          Download .ics
                        </button>
                      </>
                    ) : null}
                    {r.status === 'open' ? (
                      <button type="button" className="crm-reminder-btn" onClick={() => void markComplete(r.id)}>
                        Mark done
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ScrollSection>
  );
}
