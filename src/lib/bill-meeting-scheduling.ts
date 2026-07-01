export type BillMeetingSpecialist = {
  id: string;
  name: string;
  email: string;
};

export type BillMeetingBusyInterval = { start: string; end: string };

export type BillMeetingSlot = {
  startISO: string;
  endISO: string;
  availableSpecialists: BillMeetingSpecialist[];
};

export const BILL_MEETING_DURATION_MINUTES = 30;
export const BILL_MEETING_SLOT_STEP_MINUTES = 15;
export const BILL_MEETING_WORK_START_HOUR = 9;
export const BILL_MEETING_WORK_END_HOUR = 17;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function isFreeDuring(
  busy: BillMeetingBusyInterval[],
  startMs: number,
  endMs: number,
): boolean {
  return !busy.some((b) => {
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    if (!Number.isFinite(bStart) || !Number.isFinite(bEnd)) return false;
    return overlaps(startMs, endMs, bStart, bEnd);
  });
}

/** Lists 15-minute-start slots where at least one specialist is free for the full duration. */
export function listBillMeetingSlots(input: {
  windowStart: Date;
  windowEnd: Date;
  specialists: BillMeetingSpecialist[];
  busyByEmail: Record<string, BillMeetingBusyInterval[]>;
  durationMinutes?: number;
  stepMinutes?: number;
  workDayStartHour?: number;
  workDayEndHour?: number;
}): BillMeetingSlot[] {
  const durationMinutes = input.durationMinutes ?? BILL_MEETING_DURATION_MINUTES;
  const stepMinutes = input.stepMinutes ?? BILL_MEETING_SLOT_STEP_MINUTES;
  const dayStartHour = input.workDayStartHour ?? BILL_MEETING_WORK_START_HOUR;
  const dayEndHour = input.workDayEndHour ?? BILL_MEETING_WORK_END_HOUR;
  const durMs = durationMinutes * 60_000;
  const step = stepMinutes * 60_000;
  const now = Date.now();

  let cursor = Math.max(input.windowStart.getTime(), now);
  cursor = Math.ceil(cursor / step) * step;
  const limit = input.windowEnd.getTime();

  const slots: BillMeetingSlot[] = [];
  let guard = 0;

  while (cursor + durMs <= limit && guard < 8000) {
    guard += 1;
    const slotStart = new Date(cursor);
    const hour = slotStart.getHours() + slotStart.getMinutes() / 60;
    const slotEndHour = hour + durationMinutes / 60;

    if (hour < dayStartHour) {
      slotStart.setHours(dayStartHour, 0, 0, 0);
      cursor = slotStart.getTime();
      continue;
    }
    if (slotEndHour > dayEndHour) {
      const next = new Date(slotStart);
      next.setDate(next.getDate() + 1);
      next.setHours(dayStartHour, 0, 0, 0);
      cursor = next.getTime();
      continue;
    }

    const slotEnd = cursor + durMs;
    const availableSpecialists = input.specialists.filter((s) =>
      isFreeDuring(input.busyByEmail[s.email.toLowerCase()] ?? [], cursor, slotEnd),
    );

    if (availableSpecialists.length > 0) {
      slots.push({
        startISO: new Date(cursor).toISOString(),
        endISO: new Date(slotEnd).toISOString(),
        availableSpecialists,
      });
    }

    cursor += step;
  }

  return slots;
}

/** Demo slots for local persistence when calendar integration is unavailable. */
export function listDemoBillMeetingSlots(
  specialists: BillMeetingSpecialist[],
  days = 10,
): BillMeetingSlot[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return listBillMeetingSlots({
    windowStart: start,
    windowEnd: end,
    specialists,
    busyByEmail: Object.fromEntries(specialists.map((s) => [s.email.toLowerCase(), []])),
  });
}

export function formatBillMeetingSlotLabel(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${startTime} – ${endTime}`;
}
