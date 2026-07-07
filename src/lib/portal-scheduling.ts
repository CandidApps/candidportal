import { isLocalPersistence } from '@/lib/persistence/config';
import { saveLocalBillMeetingBooking } from '@/lib/persistence/local-bill-meetings';
import {
  listDemoBillMeetingSlots,
  type BillMeetingSpecialist,
} from '@/lib/bill-meeting-scheduling';
import type {
  BillMeetingAvailability,
  BookBillMeetingResult,
} from '@/lib/services/bill-meeting-booking';

export type { BillMeetingAvailability, BookBillMeetingResult };

const LOCAL_DEMO_SPECIALISTS: BillMeetingSpecialist[] = [
  { id: 'josh', name: 'Josh', email: 'josh@candid.solutions' },
  { id: 'joe', name: 'Joe', email: 'joe@candid.solutions' },
  { id: 'bryan', name: 'Bryan', email: 'bryan@candid.solutions' },
];

export function getLocalBillMeetingAvailability(days = 10): BillMeetingAvailability {
  return {
    specialists: LOCAL_DEMO_SPECIALISTS,
    slots: listDemoBillMeetingSlots(LOCAL_DEMO_SPECIALISTS, days),
    calendarConnected: false,
    demoMode: true,
  };
}

function bookLocalBillMeeting(input: {
  userId: string;
  specialistId: string;
  startISO: string;
  endISO: string;
  customerName: string;
  customerEmail: string;
  vendorName?: string | null;
  analysisReviewId?: string | null;
}): BookBillMeetingResult {
  const specialist = LOCAL_DEMO_SPECIALISTS.find((s) => s.id === input.specialistId);
  if (!specialist) throw new Error('Specialist not found');

  const title = input.vendorName
    ? `Bill analysis call — ${input.vendorName}`
    : 'Bill analysis discovery call';

  saveLocalBillMeetingBooking({
    userId: input.userId,
    analysisReviewId: input.analysisReviewId,
    specialist,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    vendorName: input.vendorName,
    startISO: input.startISO,
    endISO: input.endISO,
    title,
  });

  return {
    ok: true,
    title,
    specialist,
    startISO: input.startISO,
    endISO: input.endISO,
    calendarCreated: false,
    emailSent: false,
    emailPending: true,
    demoMode: true,
  };
}

export async function fetchBillMeetingAvailability(days = 10): Promise<BillMeetingAvailability> {
  if (isLocalPersistence()) {
    return getLocalBillMeetingAvailability(days);
  }
  const res = await fetch(`/api/portal/scheduling/availability?days=${days}`);
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? 'Could not load availability');
  }
  return (await res.json()) as BillMeetingAvailability;
}

export async function bookBillMeetingSlot(input: {
  specialistId: string;
  startISO: string;
  endISO: string;
  customerName: string;
  customerEmail: string;
  vendorName?: string | null;
  analysisReviewId?: string | null;
  userId?: string;
}): Promise<BookBillMeetingResult> {
  if (isLocalPersistence()) {
    if (!input.userId) throw new Error('Not signed in');
    return bookLocalBillMeeting({ ...input, userId: input.userId });
  }
  const res = await fetch('/api/portal/scheduling/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as BookBillMeetingResult & { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Booking failed');
  return json;
}
