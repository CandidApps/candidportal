import type { AssistantCalendarEvent, AssistantEventAttendee } from '@/lib/assistant/types';

function attendeeKey(a: AssistantEventAttendee): string {
  return (a.email?.trim().toLowerCase() || a.name.trim().toLowerCase());
}

/** Union two attendee lists without dropping anyone. */
export function mergeEventAttendees(
  ...lists: AssistantEventAttendee[][]
): AssistantEventAttendee[] {
  const seen = new Map<string, AssistantEventAttendee>();
  for (const list of lists) {
    for (const a of list) {
      const key = attendeeKey(a);
      if (!key) continue;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, { ...a });
        continue;
      }
      if (!existing.name && a.name) existing.name = a.name;
      if (!existing.email && a.email) existing.email = a.email;
      if (a.isOrganizer) existing.isOrganizer = true;
      if (existing.status === 'pending' && a.status !== 'pending') existing.status = a.status;
    }
  }
  return [...seen.values()];
}

/**
 * Prefer detailed fields from `incoming`, but never replace a richer attendee
 * list with a sparser Zoho response (common for teammate-organized meetings).
 */
export function mergeCalendarEventDetail(
  base: AssistantCalendarEvent,
  incoming: AssistantCalendarEvent,
): AssistantCalendarEvent {
  const attendees = mergeEventAttendees(base.attendees ?? [], incoming.attendees ?? []);
  return {
    ...base,
    ...incoming,
    title: incoming.title || base.title,
    location: incoming.location ?? base.location,
    description: incoming.description ?? base.description,
    dialpadRecapUrl: incoming.dialpadRecapUrl ?? base.dialpadRecapUrl,
    conferenceUrl: incoming.conferenceUrl ?? base.conferenceUrl,
    organizer: incoming.organizer ?? base.organizer,
    organizerName: incoming.organizerName ?? base.organizerName,
    calendarUid: incoming.calendarUid || base.calendarUid,
    etag: incoming.etag ?? base.etag,
    attendees,
    attendeeCount: attendees.length,
    attendeesComplete:
      incoming.attendeesComplete ||
      base.attendeesComplete ||
      attendees.length > (base.attendees?.length ?? 0),
  };
}
