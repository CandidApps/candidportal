/**
 * Timed-looking events that still run ~midnight→end-of-day (common all-day
 * encoding from Zoho and similar calendars). Used to keep blockers out of
 * "next meeting" / top-bar notice logic.
 */
export function looksLikeAllDaySpan(startIso: string, endIso: string): boolean {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const durationMs = end.getTime() - start.getTime();
  // All-day / multi-day blockers: at least 20 hours.
  if (durationMs < 20 * 60 * 60 * 1000) return false;
  // Local midnight (or near) start — typical all-day encoding.
  const localMinutes = start.getHours() * 60 + start.getMinutes();
  return localMinutes <= 5 || localMinutes >= 23 * 60 + 55;
}
