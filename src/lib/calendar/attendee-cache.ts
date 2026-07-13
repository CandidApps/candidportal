import type { AssistantEventAttendee } from '@/lib/assistant/types';
import { mergeEventAttendees } from '@/lib/calendar/merge-event-detail';

/**
 * Module-level cache so My Assistant's enriched week view and the top-bar
 * meeting modal share the same guest list without rehitting Zoho.
 */
const byEventId = new Map<string, AssistantEventAttendee[]>();

export function rememberEventAttendees(
  eventId: string,
  attendees: AssistantEventAttendee[] | null | undefined,
): void {
  const id = eventId?.trim();
  if (!id || !attendees?.length) return;
  const prev = byEventId.get(id) ?? [];
  const merged = mergeEventAttendees(prev, attendees);
  if (merged.length >= (prev.length || 0)) {
    byEventId.set(id, merged);
  }
}

export function rememberEventsAttendees(
  events: Array<{ id: string; attendees?: AssistantEventAttendee[] | null }>,
): void {
  for (const ev of events) {
    rememberEventAttendees(ev.id, ev.attendees);
  }
}

export function getCachedEventAttendees(eventId: string): AssistantEventAttendee[] {
  return byEventId.get(eventId.trim()) ?? [];
}
