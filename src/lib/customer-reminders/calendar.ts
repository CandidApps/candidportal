import type { CustomerReminder } from '@/lib/customer-reminders/types';

function toGoogleDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildGoogleCalendarUrl(reminder: CustomerReminder): string | null {
  if (reminder.kind !== 'calendar') return null;
  const start = reminder.calendarStartAt ?? reminder.dueAt;
  if (!start) return null;
  const end = reminder.calendarEndAt ?? start;
  const startPart = toGoogleDate(start);
  const endPart = toGoogleDate(end);
  if (!startPart) return null;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: reminder.title,
    details: reminder.body ?? '',
    dates: `${startPart}/${endPart || startPart}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcsFileContent(reminder: CustomerReminder): string | null {
  const startIso = reminder.calendarStartAt ?? reminder.dueAt;
  if (!startIso) return null;
  const endIso = reminder.calendarEndAt ?? startIso;
  const uid = `${reminder.id}@candidportal`;
  const stamp = toGoogleDate(new Date().toISOString());
  const dtStart = toGoogleDate(startIso);
  const dtEnd = toGoogleDate(endIso);
  if (!dtStart) return null;

  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Candid Portal//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd || dtStart}`,
    `SUMMARY:${escape(reminder.title)}`,
    reminder.body ? `DESCRIPTION:${escape(reminder.body)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function downloadIcsFile(reminder: CustomerReminder): void {
  const content = buildIcsFileContent(reminder);
  if (!content) return;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reminder.title.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'event'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
