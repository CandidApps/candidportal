import 'server-only';

import {
  createEvent,
  getUserFreeBusy,
  listCalendars,
  type FreeBusySlot,
} from '@/lib/calendar/zoho-calendar';
import {
  findBillMeetingSpecialistById,
  findUserIdForSpecialistEmail,
  listBillMeetingSpecialists,
} from '@/lib/bill-meeting-specialists';
import {
  BILL_MEETING_DURATION_MINUTES,
  isFreeDuring,
  listBillMeetingSlots,
  listDemoBillMeetingSlots,
  type BillMeetingSlot,
  type BillMeetingSpecialist,
} from '@/lib/bill-meeting-scheduling';
import { getActiveConnectionForUser, getActiveSharedConnection } from '@/lib/email/zoho-connections';
import { scopeHasCalendar, scopeHasFreeBusy } from '@/lib/email/zoho';
import { isSmtpConfigured, sendEmail } from '@/lib/email/mailer';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export type BillMeetingAvailability = {
  specialists: BillMeetingSpecialist[];
  slots: BillMeetingSlot[];
  calendarConnected: boolean;
  demoMode: boolean;
};

function schedulingWindow(days: number): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return { start, end };
}

async function loadBusyForSpecialists(
  specialists: BillMeetingSpecialist[],
  start: Date,
  end: Date,
): Promise<{ busyByEmail: Record<string, FreeBusySlot[]>; calendarConnected: boolean }> {
  const conn = await getActiveSharedConnection();
  if (!conn || !scopeHasFreeBusy(conn.scope)) {
    return { busyByEmail: {}, calendarConnected: false };
  }

  const busyByEmail: Record<string, FreeBusySlot[]> = {};
  await Promise.all(
    specialists.map(async (s) => {
      try {
        busyByEmail[s.email.toLowerCase()] = await getUserFreeBusy({
          accessToken: conn.accessToken,
          email: s.email,
          start,
          end,
        });
      } catch {
        busyByEmail[s.email.toLowerCase()] = [];
      }
    }),
  );
  return { busyByEmail, calendarConnected: true };
}

export async function getBillMeetingAvailability(
  days = 10,
  localMode = false,
): Promise<BillMeetingAvailability> {
  const specialists = await listBillMeetingSpecialists(localMode);
  if (!specialists.length) {
    return { specialists: [], slots: [], calendarConnected: false, demoMode: localMode };
  }

  if (localMode) {
    return {
      specialists,
      slots: listDemoBillMeetingSlots(specialists, days),
      calendarConnected: false,
      demoMode: true,
    };
  }

  const { start, end } = schedulingWindow(days);
  const { busyByEmail, calendarConnected } = await loadBusyForSpecialists(specialists, start, end);
  const slots = listBillMeetingSlots({
    windowStart: start,
    windowEnd: end,
    specialists,
    busyByEmail,
  });

  return { specialists, slots, calendarConnected, demoMode: !calendarConnected };
}

export type BookBillMeetingInput = {
  userId: string;
  specialistId: string;
  startISO: string;
  endISO: string;
  customerName: string;
  customerEmail: string;
  vendorName?: string | null;
  analysisReviewId?: string | null;
};

export type BookBillMeetingResult = {
  ok: true;
  title: string;
  specialist: BillMeetingSpecialist;
  startISO: string;
  endISO: string;
  calendarCreated: boolean;
  emailSent: boolean;
  emailPending: boolean;
  demoMode: boolean;
};

async function getSpecialistMeetingLink(userId: string | null): Promise<string> {
  if (!userId) return '';
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('admin_meeting_settings')
    .select('meeting_link')
    .eq('user_id', userId)
    .maybeSingle();
  return String(data?.meeting_link ?? '').trim();
}

async function createSpecialistCalendarEvent(input: {
  specialist: BillMeetingSpecialist;
  title: string;
  startISO: string;
  endISO: string;
  customerEmail: string;
  customerName: string;
  vendorName?: string | null;
  description?: string;
  meetingUrl?: string;
}): Promise<boolean> {
  const specialistUserId = await findUserIdForSpecialistEmail(input.specialist.email);
  const conn =
    (specialistUserId ? await getActiveConnectionForUser(specialistUserId) : null) ??
    (await getActiveSharedConnection());
  if (!conn || !scopeHasCalendar(conn.scope)) return false;

  const calendars = await listCalendars(conn.accessToken);
  const primary = calendars[0];
  if (!primary) return false;

  const notes = [
    input.vendorName ? `Bill analysis: ${input.vendorName}` : 'Bill analysis discovery call',
    `Customer: ${input.customerName} <${input.customerEmail}>`,
    input.description ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');

  await createEvent({
    accessToken: conn.accessToken,
    calendarUid: primary.uid,
    event: {
      title: input.title,
      start: input.startISO,
      end: input.endISO,
      description: notes,
      meetingUrl: input.meetingUrl || null,
      location: input.meetingUrl || null,
      attendees: [input.customerEmail, input.specialist.email],
    },
  });
  return true;
}

async function maybeSendCustomerInvite(input: {
  customerName: string;
  customerEmail: string;
  specialist: BillMeetingSpecialist;
  title: string;
  startISO: string;
  endISO: string;
  meetingUrl?: string;
}): Promise<boolean> {
  if (!isSmtpConfigured()) return false;

  const when = new Date(input.startISO).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const endWhen = new Date(input.endISO).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const linkBlock = input.meetingUrl
    ? `<p>Join link: <a href="${input.meetingUrl}">${input.meetingUrl}</a></p>`
    : '';

  await sendEmail({
    to: input.customerEmail,
    replyTo: input.specialist.email,
    fromName: `Candid — ${input.specialist.name}`,
    subject: `Your Candid discovery call — ${when}`,
    html: `
      <p>Hi ${input.customerName},</p>
      <p>Your discovery call with ${input.specialist.name} is confirmed:</p>
      <p><strong>${input.title}</strong><br>${when} – ${endWhen}</p>
      ${linkBlock}
      <p>We look forward to speaking with you.</p>
      <p>— The Candid team</p>
    `,
    text: `Hi ${input.customerName},\n\nYour discovery call with ${input.specialist.name} is confirmed:\n${input.title}\n${when} – ${endWhen}\n${input.meetingUrl ? `Join: ${input.meetingUrl}\n` : ''}\n— The Candid team`,
  });
  return true;
}

export async function bookBillMeeting(input: BookBillMeetingInput): Promise<BookBillMeetingResult> {
  const specialist = await findBillMeetingSpecialistById(input.specialistId, false);
  if (!specialist) throw new Error('Specialist not found');

  const title = input.vendorName
    ? `Bill analysis call — ${input.vendorName}`
    : 'Bill analysis discovery call';

  const start = new Date(input.startISO);
  const end = new Date(input.endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid meeting time');
  }

  const durationMs = end.getTime() - start.getTime();
  if (durationMs !== BILL_MEETING_DURATION_MINUTES * 60_000) {
    throw new Error('Meeting must be a 30-minute slot on a 15-minute grid');
  }
  if (start.getMinutes() % 15 !== 0 || start.getSeconds() !== 0 || start.getMilliseconds() !== 0) {
    throw new Error('Start time must be on a 15-minute boundary');
  }

  const { busyByEmail } = await loadBusyForSpecialists([specialist], start, end);
  const busy = busyByEmail[specialist.email.toLowerCase()] ?? [];
  if (!isFreeDuring(busy, start.getTime(), end.getTime())) {
    throw new Error('That time slot is no longer available. Please pick another.');
  }

  const specialistUserId = await findUserIdForSpecialistEmail(specialist.email);
  const meetingUrl = await getSpecialistMeetingLink(specialistUserId);

  let calendarCreated = false;
  try {
    calendarCreated = await createSpecialistCalendarEvent({
      specialist,
      title,
      startISO: input.startISO,
      endISO: input.endISO,
      customerEmail: input.customerEmail,
      customerName: input.customerName,
      vendorName: input.vendorName,
      meetingUrl: meetingUrl || undefined,
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Could not create calendar event');
  }

  let emailSent = false;
  try {
    emailSent = await maybeSendCustomerInvite({
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      specialist,
      title,
      startISO: input.startISO,
      endISO: input.endISO,
      meetingUrl: meetingUrl || undefined,
    });
  } catch {
    emailSent = false;
  }

  return {
    ok: true,
    title,
    specialist,
    startISO: input.startISO,
    endISO: input.endISO,
    calendarCreated,
    emailSent,
    emailPending: !emailSent,
    demoMode: false,
  };
}
