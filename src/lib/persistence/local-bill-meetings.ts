import type { BillMeetingSpecialist } from '@/lib/bill-meeting-scheduling';
import { newLocalId } from '@/lib/persistence/local-data-store';

const STORAGE_KEY = 'candid-local-bill-meetings-v1';

export type LocalBillMeetingBooking = {
  id: string;
  user_id: string;
  analysis_review_id: string | null;
  specialist_id: string;
  specialist_name: string;
  specialist_email: string;
  customer_name: string;
  customer_email: string;
  vendor_name: string | null;
  start_iso: string;
  end_iso: string;
  title: string;
  created_at: string;
};

function readBookings(): LocalBillMeetingBooking[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalBillMeetingBooking[]) : [];
  } catch {
    return [];
  }
}

function writeBookings(rows: LocalBillMeetingBooking[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function saveLocalBillMeetingBooking(input: {
  userId: string;
  analysisReviewId?: string | null;
  specialist: BillMeetingSpecialist;
  customerName: string;
  customerEmail: string;
  vendorName?: string | null;
  startISO: string;
  endISO: string;
  title: string;
}): LocalBillMeetingBooking {
  const row: LocalBillMeetingBooking = {
    id: newLocalId(),
    user_id: input.userId,
    analysis_review_id: input.analysisReviewId ?? null,
    specialist_id: input.specialist.id,
    specialist_name: input.specialist.name,
    specialist_email: input.specialist.email,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    vendor_name: input.vendorName ?? null,
    start_iso: input.startISO,
    end_iso: input.endISO,
    title: input.title,
    created_at: new Date().toISOString(),
  };
  const rows = readBookings();
  rows.unshift(row);
  writeBookings(rows);
  return row;
}

export function listLocalBillMeetingBookings(userId: string): LocalBillMeetingBooking[] {
  return readBookings().filter((r) => r.user_id === userId);
}
