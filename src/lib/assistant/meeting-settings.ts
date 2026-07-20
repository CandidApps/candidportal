export type MeetingSettings = {
  meetingLink: string;
  dialpadNumber: string;
  meetingDescription: string;
};

/** Endpoint that accepts a `file` form field and returns { url, name }. */
export const MEETING_ATTACHMENT_UPLOAD_URL = '/api/admin/meeting-settings/attachment';

export async function fetchMeetingSettings(): Promise<MeetingSettings> {
  const res = await fetch('/api/admin/meeting-settings');
  if (!res.ok) return { meetingLink: '', dialpadNumber: '', meetingDescription: '' };
  const json = (await res.json().catch(() => ({}))) as Partial<MeetingSettings>;
  return {
    meetingLink: json.meetingLink ?? '',
    dialpadNumber: json.dialpadNumber ?? '',
    meetingDescription: json.meetingDescription ?? '',
  };
}

export async function saveMeetingSettings(input: MeetingSettings): Promise<void> {
  const res = await fetch('/api/admin/meeting-settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to save meeting settings');
}

/** True when the user has saved a meeting link, Dialpad number, or description worth inserting. */
export function hasMeetingSettings(s: MeetingSettings | null): boolean {
  if (!s) return false;
  return Boolean(
    s.meetingLink.trim() ||
      s.dialpadNumber.trim() ||
      s.meetingDescription.replace(/<[^>]*>/g, '').trim(),
  );
}
