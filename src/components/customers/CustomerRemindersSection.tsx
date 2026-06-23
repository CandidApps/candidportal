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

const BRAND = {
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  green: '#1A7A4A',
  blue: '#1D4ED8',
} as const;

const btnSmall: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: BRAND.grayLight,
  border: `1px solid ${BRAND.grayBorder}`,
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

const kindBadgeColor: Record<CustomerReminderKind, string> = {
  task: BRAND.blue,
  reminder: '#B45309',
  calendar: '#6D28D9',
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" style={btnSmall} onClick={() => onAdd('task')}>
            + Task
          </button>
          <button type="button" style={btnSmall} onClick={() => onAdd('reminder')}>
            + Reminder
          </button>
          <button type="button" style={btnSmall} onClick={() => onAdd('calendar')}>
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
        <div style={{ padding: '8px 0' }}>
          {reminders.map((r) => {
            const gcal = buildGoogleCalendarUrl(r);
            const linked = contractTitle(r.dealExternalId);
            return (
              <div
                key={r.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${BRAND.grayBorder}`,
                  opacity: r.status === 'completed' ? 0.65 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: kindBadgeColor[r.kind],
                        }}
                      >
                        {REMINDER_KIND_LABELS[r.kind]}
                      </span>
                      {r.status === 'completed' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: BRAND.green }}>Done</span>
                      )}
                      {(r.notifyPortal || r.notifyEmail) && (
                        <span style={{ fontSize: 10, color: BRAND.gray }}>
                          {[
                            r.notifyPortal && r.portalNotifiedAt ? 'Portal notified' : r.notifyPortal ? 'Portal pending' : null,
                            r.notifyEmail && r.emailSentAt ? 'Email sent' : r.notifyEmail ? 'Email pending' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark, marginTop: 4 }}>{r.title}</div>
                    {r.body && (
                      <div style={{ fontSize: 12, color: BRAND.gray, marginTop: 4, lineHeight: 1.5 }}>{r.body}</div>
                    )}
                    <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 6 }}>
                      {formatReminderWhen(r)}
                      {linked ? ` · Contract: ${linked}` : ''}
                      {r.contactEmail ? ` · ${r.contactEmail}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {r.kind === 'calendar' && gcal && (
                      <>
                        <a
                          href={gcal}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ ...btnSmall, textDecoration: 'none', color: BRAND.grayDark }}
                        >
                          Google Calendar
                        </a>
                        <button type="button" style={btnSmall} onClick={() => downloadIcsFile(r)}>
                          Download .ics
                        </button>
                      </>
                    )}
                    {r.status === 'open' && (
                      <button type="button" style={btnSmall} onClick={() => void markComplete(r.id)}>
                        Mark done
                      </button>
                    )}
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
